import {createWorker, onFinalFailure, shutdownOnSignal} from '@vidflow/queues';
import {createRuntime} from '@vidflow/worker-runtime';

import {loadEnv} from './env';
import {generateThumbnails} from './generate-thumbnails';

const env = loadEnv();
const rt = createRuntime({
  service: 'thumbnail-worker',
  metricsPort: env.METRICS_PORT,
  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,
  queuePrefix: env.QUEUE_PREFIX,
});

const worker = createWorker(
  'thumbnail',
  (data) =>
    generateThumbnails(
      {videos: rt.videos, storage: rt.storage, tmpDir: env.THUMBNAIL_TMP_DIR},
      data,
    ),
  {
    redisUrl: env.REDIS_URL,
    prefix: env.QUEUE_PREFIX,
    log: rt.log,
    concurrency: env.THUMBNAIL_CONCURRENCY,
  },
);

// Thumbnails are cosmetic: note the failure on the timeline, keep the video.
onFinalFailure(
  worker,
  async (job, err) => {
    await rt.videos.addEvent(job.data.videoId, 'thumbnail', `Thumbnails failed: ${err.message}`);
  },
  rt.log,
  rt.pipeline,
);

rt.instrument(worker);
rt.log.info(`thumbnail-worker started (concurrency ${env.THUMBNAIL_CONCURRENCY})`);
shutdownOnSignal([worker], rt.close, rt.log);
