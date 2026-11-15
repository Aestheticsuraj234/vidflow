import {createWorker, onFinalFailure, shutdownOnSignal} from '@vidflow/queues';
import {createRuntime} from '@vidflow/worker-runtime';

import {loadEnv} from './env';
import {sweepTempDirs, transcodeRendition} from './transcode-rendition';

const env = loadEnv();
const rt = createRuntime({
  service: 'transcode-worker',
  metricsPort: env.METRICS_PORT,
  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,
  queuePrefix: env.QUEUE_PREFIX,
});

const swept = await sweepTempDirs(env.TRANSCODE_TMP_DIR);
if (swept > 0) rt.log.info({swept}, 'removed stale temp folders');

const worker = createWorker(
  'transcode',
  (data, job) =>
    transcodeRendition(
      {
        videos: rt.videos,
        storage: rt.storage,
        tmpDir: env.TRANSCODE_TMP_DIR,
        preset: env.FFMPEG_PRESET,
        threads: env.FFMPEG_THREADS,
        timeoutMs: env.TRANSCODE_TIMEOUT_MS,
        onEncoded: (name, realtime) => rt.metrics.encodeSpeed.observe({rendition: name}, realtime),
      },
      data,
      job,
    ),
  {
    redisUrl: env.REDIS_URL,
    prefix: env.QUEUE_PREFIX,
    log: rt.log,
    concurrency: env.TRANSCODE_CONCURRENCY,
    // Encodes are long and CPU-bound: renew the lock less eagerly and give a
    // busy event loop more slack before BullMQ calls the job stalled.
    lockDuration: env.TRANSCODE_LOCK_MS,
    stalledInterval: env.TRANSCODE_LOCK_MS,
    // A job that stalls twice (it keeps killing its worker, e.g. OOM) fails.
    maxStalledCount: 2,
  },
);
onFinalFailure(
  worker,
  async (job, err) => {
    await rt.videos.updateRendition(job.data.renditionId, {status: 'failed'});
    await rt.failVideo(
      job.data.videoId,
      `Transcode ${job.data.rendition.name} failed: ${err.message}`,
    );
  },
  rt.log,
  rt.pipeline,
);

rt.instrument(worker);
rt.log.info(
  `transcode-worker started (concurrency ${env.TRANSCODE_CONCURRENCY}, preset ${env.FFMPEG_PRESET})`,
);
shutdownOnSignal([worker], rt.close, rt.log);
