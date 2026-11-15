import {createDb, VideoRepository} from '@vidflow/db';
import {createWorker, onFinalFailure, shutdownOnSignal} from '@vidflow/queues';
import {createStorageFromEnv} from '@vidflow/storage';

import {loadEnv} from './env';
import {generateThumbnails} from './generate-thumbnails';

const env = loadEnv();
const {db, pool} = createDb(env.DATABASE_URL);
const videos = new VideoRepository(db);
const storage = createStorageFromEnv();

const worker = createWorker(
  'thumbnail',
  (data) => generateThumbnails({videos, storage, tmpDir: env.THUMBNAIL_TMP_DIR}, data),
  {redisUrl: env.REDIS_URL, prefix: env.QUEUE_PREFIX, concurrency: env.THUMBNAIL_CONCURRENCY},
);

// Thumbnails are cosmetic: note the failure on the timeline, keep the video.
onFinalFailure(worker, async (job, err) => {
  await videos.addEvent(job.data.videoId, 'thumbnail', `Thumbnails failed: ${err.message}`);
});

console.log(`thumbnail-worker started (concurrency ${env.THUMBNAIL_CONCURRENCY})`);
shutdownOnSignal([worker], () => pool.end());
