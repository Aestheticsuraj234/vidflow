/**
 * What every worker process needs, wired once: Postgres, storage, the
 * pipeline, and a `VideoRepository` whose changes are published live.
 */
import {createDb, VideoRepository, type Database} from '@vidflow/db';
import {LivePublisher, Pipeline, type WebhookEvent} from '@vidflow/queues';
import {
  createLogger,
  createMetrics,
  instrumentWorker,
  startMetricsServer,
  type Logger,
  type Metrics,
} from '@vidflow/observability';
import {createStorageFromEnv, type S3StorageProvider} from '@vidflow/storage';

export interface RuntimeOptions {
  /** Service name on every log line and metric. */
  service: string;
  /** Port for `/metrics` and `/health`; 0 disables it. */
  metricsPort?: number;
  databaseUrl: string;
  redisUrl: string;
  queuePrefix: string;
}

export interface WorkerRuntime {
  db: Database;
  videos: VideoRepository;
  storage: S3StorageProvider;
  pipeline: Pipeline;
  live: LivePublisher;
  log: Logger;
  metrics: Metrics;
  /** Adds job metrics to a worker. */
  instrument(worker: Parameters<typeof instrumentWorker>[0]): void;
  /**
   * Fails a video and, if this call is what failed it, tells the owner's
   * webhooks. Safe to call for a video that is already failed or canceled.
   */
  failVideo(videoId: string, reason: string): Promise<void>;
  notify(videoId: string, userId: string, event: WebhookEvent): Promise<void>;
  close(): Promise<void>;
}

export function createRuntime({
  service,
  metricsPort = 0,
  databaseUrl,
  redisUrl,
  queuePrefix,
}: RuntimeOptions): WorkerRuntime {
  const log = createLogger(service);
  const metrics = createMetrics(service);
  const {db, pool} = createDb(databaseUrl);
  const pipeline = new Pipeline({
    redisUrl,
    prefix: queuePrefix,
    onError: (err) => log.error({err: err.message}, 'redis error'),
  });
  // Healthy = Redis answers. Kubernetes restarts a worker that stays unhealthy.
  const server =
    metricsPort > 0
      ? startMetricsServer(metricsPort, metrics.registry, () => pipeline.isAvailable())
      : null;
  // The loader refers to `videos`, declared right below; it only runs later.
  const live = new LivePublisher({
    redisUrl,
    prefix: queuePrefix,
    onError: (err) => log.error({err: err.message}, 'live publish failed'),
    load: async (id) => {
      const v = await videos.findById(id);
      return v && {userId: v.userId, status: v.status, progress: v.progress, error: v.error};
    },
  });
  const videos: VideoRepository = new VideoRepository(db, {onChange: live.videoChanged});

  return {
    db,
    videos,
    storage: createStorageFromEnv(),
    pipeline,
    live,
    log,
    metrics,
    instrument: (worker) => instrumentWorker(worker, metrics),
    async failVideo(videoId, reason) {
      const failed = await videos.fail(videoId, reason);
      if (failed) await pipeline.enqueueNotify(videoId, failed.userId, 'video.failed');
    },
    notify: (videoId, userId, event) => pipeline.enqueueNotify(videoId, userId, event),
    async close() {
      server?.close();
      await live.close();
      await pipeline.close();
      await pool.end();
    },
  };
}
