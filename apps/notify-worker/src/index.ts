import {createDb, VideoRepository, WebhookRepository} from '@vidflow/db';
import {
  createLogger,
  createMetrics,
  instrumentWorker,
  startMetricsServer,
} from '@vidflow/observability';
import {createWorker, onFinalFailure, Pipeline, shutdownOnSignal} from '@vidflow/queues';
import {createStorageFromEnv} from '@vidflow/storage';

import {loadEnv} from './env';
import {sweepStaleUploads} from './maintenance';
import {deliver, fanOut, type NotifyDeps} from './notify';

const env = loadEnv();
const log = createLogger('notify-worker');
const metrics = createMetrics('notify-worker');
const {db, pool} = createDb(env.DATABASE_URL);
const pipeline = new Pipeline({
  redisUrl: env.REDIS_URL,
  prefix: env.QUEUE_PREFIX,
  onError: (err) => log.error({err: err.message}, 'redis error'),
});
const server =
  env.METRICS_PORT > 0
    ? startMetricsServer(
        env.METRICS_PORT,
        metrics.registry,
        () => pipeline.isAvailable(),
        (err) => log.error({err: err.message, port: env.METRICS_PORT}, 'metrics server failed'),
      )
    : null;
const webhooks = new WebhookRepository(db);
const deps: NotifyDeps = {
  videos: new VideoRepository(db),
  webhooks,
  storage: createStorageFromEnv(),
  pipeline,
  allowPrivate: env.WEBHOOK_ALLOW_PRIVATE,
  timeoutMs: env.WEBHOOK_TIMEOUT_MS,
};
const options = {
  redisUrl: env.REDIS_URL,
  prefix: env.QUEUE_PREFIX,
  concurrency: env.NOTIFY_CONCURRENCY,
  log,
};

const notifyWorker = createWorker('notify', (data) => fanOut(deps, data), options);
const deliverWorker = createWorker(
  'deliver',
  (data, job) => deliver(deps, data, job.attemptsMade + 1),
  options,
);
// Housekeeping: light work, so it lives in this light worker. A job scheduler
// keeps exactly one schedule however many worker replicas run.
const maintenanceWorker = createWorker(
  'maintenance',
  async ({task}) => {
    if (task === 'stale-uploads') return {changed: await sweepStaleUploads(deps)};
    return {changed: 0};
  },
  {...options, concurrency: 1},
);
await pipeline
  .queue('maintenance')
  .upsertJobScheduler(
    'stale-uploads',
    {every: 15 * 60_000},
    {name: 'stale-uploads', data: {task: 'stale-uploads'}},
  );

onFinalFailure(notifyWorker, async () => undefined, log, pipeline);

// Out of retries: the log already holds the last error; mark it failed.
onFinalFailure(
  deliverWorker,
  async (job, err) => {
    const found = await webhooks.findDelivery(job.data.deliveryId);
    if (found && found.delivery.status !== 'delivered') {
      await webhooks.recordAttempt(job.data.deliveryId, {
        status: 'failed',
        attempts: job.attemptsMade,
        lastStatusCode: found.delivery.lastStatusCode,
        lastError: found.delivery.lastError ?? err.message,
      });
    }
  },
  log,
  pipeline,
);

const workers = [notifyWorker, deliverWorker, maintenanceWorker];
for (const w of workers) instrumentWorker(w, metrics);
if (env.WEBHOOK_ALLOW_PRIVATE) log.warn('WEBHOOK_ALLOW_PRIVATE is on: development only');
log.info(`notify-worker started (concurrency ${env.NOTIFY_CONCURRENCY})`);
shutdownOnSignal(
  workers,
  async () => {
    server?.close();
    await pipeline.close();
    await pool.end();
  },
  log,
);
