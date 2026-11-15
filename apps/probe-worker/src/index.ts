import {createDb, VideoRepository} from '@vidflow/db';
import {createWorker, onFinalFailure, Pipeline, shutdownOnSignal} from '@vidflow/queues';
import {createStorageFromEnv} from '@vidflow/storage';

import {loadEnv} from './env';
import {probeVideo} from './probe-video';

const env = loadEnv();
const {db, pool} = createDb(env.DATABASE_URL);
const videos = new VideoRepository(db);
const storage = createStorageFromEnv();
const pipeline = new Pipeline({redisUrl: env.REDIS_URL, prefix: env.QUEUE_PREFIX});

const worker = createWorker(
  'probe',
  (data) => probeVideo({videos, storage, pipeline, maxDurationMs: env.MAX_DURATION_MS}, data),
  {redisUrl: env.REDIS_URL, prefix: env.QUEUE_PREFIX, concurrency: env.PROBE_CONCURRENCY},
);
onFinalFailure(worker, async (job, err) => {
  await videos.fail(job.data.videoId, `Probe failed: ${err.message}`);
});

console.log(`probe-worker started (concurrency ${env.PROBE_CONCURRENCY})`);
shutdownOnSignal([worker], async () => {
  await pipeline.close();
  await pool.end();
});
