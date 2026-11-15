/** Packaging with real FFmpeg, RustFS and Postgres, then playback over HTTP. */
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {probe} from '@vidflow/media';
import {jobIds} from '@vidflow/queues';
import {createTestContext} from '@vidflow/test-utils';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {transcodeRendition} from '../../transcode-worker/src/transcode-rendition';
import {packageVideo, type PackageDeps} from '../src/package-video';

const t = createTestContext('package');
let deps: PackageDeps;
afterAll(() => t.close());
beforeAll(async () => {
  deps = {
    videos: t.videos,
    storage: t.storage,
    pipeline: t.pipeline,
    tmpDir: await mkdtemp(join(tmpdir(), 'vf-package-test-')),
    keepRenditionMp4: false,
  };
});

/** A video with two renditions already transcoded, as the flow leaves it. */
async function transcodedVideo() {
  const video = await t.uploadedVideo('landscape.mp4', 'processing');
  await t.videos.update(video.id, {durationMs: 3000});
  const specs = [
    {name: '360p', width: 640, height: 360, videoBitrateKbps: 800, audioBitrateKbps: 96},
    {name: '240p', width: 426, height: 240, videoBitrateKbps: 400, audioBitrateKbps: 64},
  ];
  const rows = await t.videos.createRenditions(specs.map((s) => ({videoId: video.id, ...s})));
  const tdeps = {
    videos: t.videos,
    storage: t.storage,
    tmpDir: deps.tmpDir,
    preset: 'veryfast',
    threads: 2,
    timeoutMs: 60_000,
  };
  for (const row of rows) {
    const spec = specs.find((s) => s.name === row.name)!;
    await transcodeRendition(tdeps, {
      videoId: video.id,
      renditionId: row.id,
      gopFrames: 60,
      rendition: spec,
    });
  }
  return video;
}

describe('packageVideo', () => {
  it('publishes HLS, marks the video ready and queues the webhook', async () => {
    const video = await transcodedVideo();
    const result = await packageVideo(deps, {videoId: video.id});
    expect(result).toEqual({
      masterKey: `public/videos/${video.id}/master.m3u8`,
      renditions: ['360p', '240p'],
    });

    const after = await t.videos.findById(video.id);
    expect(after).toMatchObject({status: 'ready', progress: 100});
    expect(after?.readyAt).toBeInstanceOf(Date);
    for (const r of await t.videos.listRenditions(video.id)) {
      expect(r).toMatchObject({
        status: 'packaged',
        playlistKey: `public/videos/${video.id}/${r.name}/index.m3u8`,
      });
    }

    // Public, anonymous, with the right headers: what a CDN and a player see.
    const masterUrl = t.storage.publicUrl(result.masterKey);
    const master = await fetch(masterUrl);
    expect(master.status).toBe(200);
    expect(master.headers.get('content-type')).toBe('application/vnd.apple.mpegurl');
    expect(master.headers.get('cache-control')).toBe('public, max-age=60');
    const text = await master.text();
    expect(text).toMatch(
      /BANDWIDTH=\d+,AVERAGE-BANDWIDTH=\d+,RESOLUTION=640x360,FRAME-RATE=30.000,CODECS="avc1.64[0-9a-f]{4},mp4a.40.2"\n360p\/index.m3u8/,
    );
    expect(text.indexOf('360p/')).toBeLessThan(text.indexOf('240p/'));

    const seg = await fetch(t.storage.publicUrl(`public/videos/${video.id}/360p/seg_00000.m4s`));
    expect(seg.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(seg.headers.get('content-type')).toBe('video/iso.segment');

    // A player-like client can read the whole thing over HTTP.
    const info = await probe(masterUrl);
    expect(info).toMatchObject({width: 640, height: 360, hasAudio: true});

    // Intermediate MP4s are gone; the webhook job is queued.
    expect(await t.storage.list(`work/${video.id}/`)).toEqual([]);
    expect(
      await t.pipeline.queue('notify').getJob(jobIds.notify(video.id, 'video.ready')),
    ).toBeTruthy();
    expect((await t.videos.listEvents(video.id)).at(-1)?.message).toMatch(
      /Ready: 2 renditions, 4 segments/,
    );
  });

  it('does nothing for a video that is already ready', async () => {
    const video = await transcodedVideo();
    await packageVideo({...deps, keepRenditionMp4: true}, {videoId: video.id});
    const again = await packageVideo(deps, {videoId: video.id});
    expect(again.renditions).toHaveLength(2);
  });

  it('refuses canceled videos', async () => {
    const video = await t.uploadedVideo('landscape.mp4', 'canceled');
    await expect(packageVideo(deps, {videoId: video.id})).rejects.toThrow('Video is canceled');
  });
});
