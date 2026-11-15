/** The probe stage against real Postgres, RustFS, Redis and ffprobe. */
import {jobIds, type ProbeResult} from '@vidflow/queues';
import {createTestContext} from '@vidflow/test-utils';
import {afterAll, describe, expect, it} from 'vitest';

import {probeVideo, type ProbeDeps} from '../src/probe-video';

const t = createTestContext('probe');
const deps: ProbeDeps = {
  videos: t.videos,
  storage: t.storage,
  pipeline: t.pipeline,
  maxDurationMs: 60_000,
};
afterAll(() => t.close());

describe('probeVideo', () => {
  it('stores metadata, creates renditions and starts the flow', async () => {
    const video = await t.uploadedVideo('landscape.mp4');
    const result: ProbeResult = await probeVideo(deps, {videoId: video.id});
    expect(result.renditions).toEqual(['720p', '480p', '360p', '240p']);

    const after = await t.videos.findById(video.id);
    expect(after).toMatchObject({
      status: 'processing',
      width: 1280,
      height: 720,
      fps: 30,
      videoCodec: 'h264',
      hasAudio: true,
    });
    expect(after?.durationMs).toBeGreaterThan(2900);

    const renditions = await t.videos.listRenditions(video.id);
    expect(renditions.map((r) => [r.name, r.width, r.height])).toEqual([
      ['720p', 1280, 720],
      ['480p', 854, 480],
      ['360p', 640, 360],
      ['240p', 426, 240],
    ]);

    const parent = await t.pipeline.queue('package').getJob(jobIds.package(video.id));
    expect(await parent?.getState()).toBe('waiting-children');
    const child = await t.pipeline.queue('transcode').getJob(jobIds.transcode(video.id, '720p'));
    expect(child?.data).toMatchObject({gopFrames: 60, rendition: {width: 1280, height: 720}});
    expect(await t.pipeline.queue('thumbnail').getJob(jobIds.thumbnail(video.id))).toBeTruthy();

    const events = await t.videos.listEvents(video.id);
    expect(events.map((e) => e.message).join('\n')).toMatch(/1280×720 h264 30fps.*→ 720p, 480p/);
  });

  it('is safe to run twice', async () => {
    const video = await t.uploadedVideo('silent-small.mp4');
    await probeVideo(deps, {videoId: video.id});
    await probeVideo(deps, {videoId: video.id});
    expect(await t.videos.listRenditions(video.id)).toHaveLength(1);
    expect(
      await t.pipeline.queue('transcode').getJobCountByTypes('prioritized', 'waiting'),
    ).toBeGreaterThan(0);
    const transcodes = await t.pipeline.queue('transcode').getJobs(['prioritized', 'waiting']);
    expect(transcodes.filter((j) => j.data.videoId === video.id)).toHaveLength(1);
  });

  it('keeps phone videos portrait', async () => {
    const video = await t.uploadedVideo('rotated.mp4');
    await probeVideo(deps, {videoId: video.id});
    const [top] = await t.videos.listRenditions(video.id);
    expect(top).toMatchObject({name: '720p', width: 720, height: 1280});
  });

  it('rejects files that are not video without retrying', async () => {
    const video = await t.uploadedVideo('not-a-video.mp4');
    await expect(probeVideo(deps, {videoId: video.id})).rejects.toMatchObject({
      name: 'UnrecoverableError',
      message: expect.stringMatching(/Not a readable video/),
    });
  });

  it('rejects videos over the length limit', async () => {
    const video = await t.uploadedVideo('landscape.mp4');
    await expect(probeVideo({...deps, maxDurationMs: 1000}, {videoId: video.id})).rejects.toThrow(
      /limit is 1.0s/,
    );
  });

  it('skips videos that were canceled', async () => {
    const video = await t.uploadedVideo('landscape.mp4', 'canceled');
    expect(await probeVideo(deps, {videoId: video.id})).toEqual({durationMs: 0, renditions: []});
    expect(await t.videos.listRenditions(video.id)).toEqual([]);
  });
});
