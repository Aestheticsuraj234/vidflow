/** The real worker wiring: a bad file ends with the video marked failed. */
import {createWorker, onFinalFailure} from '@vidflow/queues';
import {createTestContext} from '@vidflow/test-utils';
import {afterAll, expect, it} from 'vitest';

import {probeVideo} from '../src/probe-video';

const t = createTestContext('probe-worker');
afterAll(() => t.close());

it('marks the video failed when probing fails for good', async () => {
  const video = await t.uploadedVideo('audio-only.m4a');
  const worker = createWorker(
    'probe',
    (data) =>
      probeVideo(
        {videos: t.videos, storage: t.storage, pipeline: t.pipeline, maxDurationMs: 60_000},
        data,
      ),
    {redisUrl: t.redisUrl, prefix: t.prefix, log: {info: () => undefined, error: () => undefined}},
  );
  const failed = new Promise<void>((resolve) =>
    onFinalFailure(worker, async (job, err) => {
      await t.videos.fail(job.data.videoId, `Probe failed: ${err.message}`);
      resolve();
    }),
  );
  await t.pipeline.enqueueProbe(video.id);
  await failed;
  await worker.close();
  expect(await t.videos.findById(video.id)).toMatchObject({
    status: 'failed',
    error: 'Probe failed: No video stream found',
  });
});
