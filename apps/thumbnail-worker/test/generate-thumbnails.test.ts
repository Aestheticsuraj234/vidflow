import {mkdtemp, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {createTestContext} from '@vidflow/test-utils';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {generateThumbnails, type ThumbnailDeps} from '../src/generate-thumbnails';

const t = createTestContext('thumbs');
let deps: ThumbnailDeps;
beforeAll(async () => {
  deps = {
    videos: t.videos,
    storage: t.storage,
    tmpDir: await mkdtemp(join(tmpdir(), 'vf-thumbs-test-')),
  };
});
afterAll(() => t.close());

async function probedVideo(
  fixture: string,
  meta: {durationMs: number; width: number; height: number},
) {
  const video = await t.uploadedVideo(fixture, 'processing');
  await t.videos.update(video.id, meta);
  return video;
}

describe('generateThumbnails', () => {
  it('publishes a poster, a sprite and its VTT', async () => {
    const video = await probedVideo('landscape.mp4', {durationMs: 3000, width: 1280, height: 720});
    const result = await generateThumbnails(deps, {videoId: video.id});
    expect(result).toEqual({
      posterKey: `public/videos/${video.id}/poster.jpg`,
      spriteKey: `public/videos/${video.id}/sprite.jpg`,
    });

    const assets = await t.videos.listAssets(video.id);
    const byKind = Object.fromEntries(assets.map((a) => [a.kind, a]));
    expect(byKind.poster).toMatchObject({width: 1280, height: 720, contentType: 'image/jpeg'});
    expect(byKind.sprite).toMatchObject({width: 480, height: 90});
    expect(byKind.sprite_vtt?.contentType).toBe('text/vtt');

    const poster = await fetch(t.storage.publicUrl(result.posterKey));
    expect(poster.status).toBe(200);
    expect(poster.headers.get('content-type')).toBe('image/jpeg');
    const vtt = await (
      await fetch(t.storage.publicUrl(`public/videos/${video.id}/sprite.vtt`))
    ).text();
    expect(vtt).toContain('00:00:02.000 --> 00:00:03.000\nsprite.jpg#xywh=320,0,160,90');

    expect((await t.videos.listEvents(video.id)).at(-1)?.message).toBe(
      'Poster 1280×720 and 3-frame preview sprite (every 1s)',
    );
    expect(await readdir(deps.tmpDir)).toEqual([]);
  });

  it('is safe to run twice', async () => {
    const video = await probedVideo('silent-small.mp4', {
      durationMs: 2000,
      width: 320,
      height: 180,
    });
    await generateThumbnails(deps, {videoId: video.id});
    await generateThumbnails(deps, {videoId: video.id});
    expect(await t.videos.listAssets(video.id)).toHaveLength(3);
  });

  it('handles portrait video', async () => {
    const video = await probedVideo('rotated.mp4', {durationMs: 3000, width: 720, height: 1280});
    await generateThumbnails(deps, {videoId: video.id});
    const poster = (await t.videos.listAssets(video.id)).find((a) => a.kind === 'poster');
    expect(poster).toMatchObject({width: 720, height: 1280});
  });

  it('refuses unprobed and canceled videos', async () => {
    const unprobed = await t.uploadedVideo('landscape.mp4', 'processing');
    await expect(generateThumbnails(deps, {videoId: unprobed.id})).rejects.toThrow(
      'not been probed',
    );
    const canceled = await t.uploadedVideo('landscape.mp4', 'canceled');
    await expect(generateThumbnails(deps, {videoId: canceled.id})).rejects.toThrow(
      'Video is canceled',
    );
  });
});
