import {createDb, VideoRepository} from '@vidflow/db';
import {createWorker, onFinalFailure, Pipeline, shutdownOnSignal} from '@vidflow/queues';
import {createStorageFromEnv} from '@vidflow/storage';

import {loadEnv} from './env';
import {packageVideo} from './package-video';

const env = loadEnv();
const {db, pool} = createDb(env.DATABASE_URL);
const videos = new VideoRepository(db);
const storage = createStorageFromEnv();
const pipeline = new Pipeline({redisUrl: env.REDIS_URL, prefix: env.QUEUE_PREFIX});

const worker = createWorker(
  'package',
  (data) =>
    packageVideo(
      {
        videos,
        storage,
        pipeline,
        tmpDir: env.PACKAGE_TMP_DIR,
        keepRenditionMp4: env.KEEP_RENDITION_MP4,
      },
      data,
    ),
  {redisUrl: env.REDIS_URL, prefix: env.QUEUE_PREFIX, concurrency: env.PACKAGE_CONCURRENCY},
);

// Also fires when a transcode child failed for good: BullMQ fails this parent
// as soon as it is picked up. The transcode worker has usually failed the
// video already; `fail()` is a no-op for videos in a final state.
onFinalFailure(worker, async (job, err) => {
  await videos.fail(job.data.videoId, `Packaging failed: ${err.message}`);
});

console.log(`package-worker started (concurrency ${env.PACKAGE_CONCURRENCY})`);
shutdownOnSignal([worker], async () => {
  await pipeline.close();
  await pool.end();
});
