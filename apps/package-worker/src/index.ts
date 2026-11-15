import {createWorker, onFinalFailure, shutdownOnSignal} from '@vidflow/queues';
import {createRuntime} from '@vidflow/worker-runtime';

import {loadEnv} from './env';
import {packageVideo} from './package-video';

const env = loadEnv();
const rt = createRuntime({
  service: 'package-worker',
  metricsPort: env.METRICS_PORT,
  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,
  queuePrefix: env.QUEUE_PREFIX,
});

const worker = createWorker(
  'package',
  (data) =>
    packageVideo(
      {
        videos: rt.videos,
        storage: rt.storage,
        pipeline: rt.pipeline,
        tmpDir: env.PACKAGE_TMP_DIR,
        keepRenditionMp4: env.KEEP_RENDITION_MP4,
      },
      data,
    ),
  {
    redisUrl: env.REDIS_URL,
    prefix: env.QUEUE_PREFIX,
    log: rt.log,
    concurrency: env.PACKAGE_CONCURRENCY,
  },
);

// Also fires when a transcode child failed for good: BullMQ fails this parent
// as soon as it is picked up. The transcode worker has usually failed the
// video already, and then this is a no-op.
onFinalFailure(
  worker,
  (job, err) => rt.failVideo(job.data.videoId, `Packaging failed: ${err.message}`),
  rt.log,
  rt.pipeline,
);

rt.instrument(worker);
rt.log.info(`package-worker started (concurrency ${env.PACKAGE_CONCURRENCY})`);
shutdownOnSignal([worker], rt.close, rt.log);
