import {createDb, VideoRepository} from '@vidflow/db';
import {createWorker, onFinalFailure, shutdownOnSignal} from '@vidflow/queues';
import {createStorageFromEnv} from '@vidflow/storage';

import {loadEnv} from './env';
import {sweepTempDirs, transcodeRendition} from './transcode-rendition';

const env = loadEnv();
const {db, pool} = createDb(env.DATABASE_URL);
const videos = new VideoRepository(db);
const storage = createStorageFromEnv();

const swept = await sweepTempDirs(env.TRANSCODE_TMP_DIR);
if (swept > 0) console.log(`removed ${swept} stale temp folder(s)`);

const worker = createWorker(
  'transcode',
  (data, job) =>
    transcodeRendition(
      {
        videos,
        storage,
        tmpDir: env.TRANSCODE_TMP_DIR,
        preset: env.FFMPEG_PRESET,
        threads: env.FFMPEG_THREADS,
        timeoutMs: env.TRANSCODE_TIMEOUT_MS,
      },
      data,
      job,
    ),
  {
    redisUrl: env.REDIS_URL,
    prefix: env.QUEUE_PREFIX,
    concurrency: env.TRANSCODE_CONCURRENCY,
    // Encodes are long and CPU-bound: renew the lock less eagerly and give a
    // busy event loop more slack before BullMQ calls the job stalled.
    lockDuration: 60_000,
    stalledInterval: 60_000,
  },
);
onFinalFailure(worker, async (job, err) => {
  await videos.updateRendition(job.data.renditionId, {status: 'failed'});
  await videos.fail(
    job.data.videoId,
    `Transcode ${job.data.rendition.name} failed: ${err.message}`,
  );
});

console.log(
  `transcode-worker started (concurrency ${env.TRANSCODE_CONCURRENCY}, preset ${env.FFMPEG_PRESET})`,
);
shutdownOnSignal([worker], () => pool.end());
