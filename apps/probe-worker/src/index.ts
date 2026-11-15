import {createWorker, onFinalFailure, shutdownOnSignal} from '@vidflow/queues';
import {createRuntime} from '@vidflow/worker-runtime';

import {loadEnv} from './env';
import {probeVideo} from './probe-video';

const env = loadEnv();
const rt = createRuntime({
  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,
  queuePrefix: env.QUEUE_PREFIX,
});

const worker = createWorker(
  'probe',
  (data) =>
    probeVideo(
      {
        videos: rt.videos,
        storage: rt.storage,
        pipeline: rt.pipeline,
        maxDurationMs: env.MAX_DURATION_MS,
        onProcessing: (video) => rt.notify(video.id, video.userId, 'video.processing'),
      },
      data,
    ),
  {redisUrl: env.REDIS_URL, prefix: env.QUEUE_PREFIX, concurrency: env.PROBE_CONCURRENCY},
);
onFinalFailure(worker, (job, err) =>
  rt.failVideo(job.data.videoId, `Probe failed: ${err.message}`),
);

console.log(`probe-worker started (concurrency ${env.PROBE_CONCURRENCY})`);
shutdownOnSignal([worker], rt.close);
