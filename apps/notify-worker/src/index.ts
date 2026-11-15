import {createDb, VideoRepository, WebhookRepository} from '@vidflow/db';
import {createWorker, onFinalFailure, Pipeline, shutdownOnSignal} from '@vidflow/queues';
import {createStorageFromEnv} from '@vidflow/storage';

import {loadEnv} from './env';
import {deliver, fanOut, type NotifyDeps} from './notify';

const env = loadEnv();
const {db, pool} = createDb(env.DATABASE_URL);
const pipeline = new Pipeline({redisUrl: env.REDIS_URL, prefix: env.QUEUE_PREFIX});
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
};

const notifyWorker = createWorker('notify', (data) => fanOut(deps, data), options);
const deliverWorker = createWorker(
  'deliver',
  (data, job) => deliver(deps, data, job.attemptsMade + 1),
  options,
);
// Out of retries: the log already holds the last error; mark it failed.
onFinalFailure(deliverWorker, async (job, err) => {
  const found = await webhooks.findDelivery(job.data.deliveryId);
  if (found && found.delivery.status !== 'delivered') {
    await webhooks.recordAttempt(job.data.deliveryId, {
      status: 'failed',
      attempts: job.attemptsMade,
      lastStatusCode: found.delivery.lastStatusCode,
      lastError: found.delivery.lastError ?? err.message,
    });
  }
});

if (env.WEBHOOK_ALLOW_PRIVATE) console.warn('WEBHOOK_ALLOW_PRIVATE is on: development only');
console.log(`notify-worker started (concurrency ${env.NOTIFY_CONCURRENCY})`);
shutdownOnSignal([notifyWorker, deliverWorker], async () => {
  await pipeline.close();
  await pool.end();
});
