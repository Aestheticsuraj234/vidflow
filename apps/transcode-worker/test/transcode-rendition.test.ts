/** The transcode stage with real FFmpeg, Postgres and RustFS. */
import {mkdir, mkdtemp, readdir, utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import type {Video} from '@vidflow/db';
import {probe} from '@vidflow/media';
import type {JobData} from '@vidflow/queues';
import {createTestContext} from '@vidflow/test-utils';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {sweepTempDirs, transcodeRendition, type TranscodeDeps} from '../src/transcode-rendition';

const t = createTestContext('transcode');
let tmpDir: string;
let deps: TranscodeDeps;

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'vf-transcode-test-'));
  deps = {
    videos: t.videos,
    storage: t.storage,
    tmpDir,
    preset: 'ultrafast',
    threads: 2,
    timeoutMs: 60_000,
    progressIntervalMs: 0,
  };
});
afterAll(() => t.close());

/** A probed video in `processing` with one rendition row. */
async function processingVideo(
  name = '360p',
  size = {width: 640, height: 360},
): Promise<{video: Video; data: JobData<'transcode'>}> {
  const video = await t.uploadedVideo('landscape.mp4', 'processing');
  await t.videos.update(video.id, {durationMs: 3000});
  const [row] = await t.videos.createRenditions([
    {videoId: video.id, name, ...size, videoBitrateKbps: 800, audioBitrateKbps: 96},
  ]);
  if (!row) throw new Error('no rendition');
  return {
    video,
    data: {
      videoId: video.id,
      renditionId: row.id,
      gopFrames: 60,
      rendition: {name, ...size, videoBitrateKbps: 800, audioBitrateKbps: 96},
    },
  };
}

describe('transcodeRendition', () => {
  it('encodes, uploads the MP4 and records the result', async () => {
    const {video, data} = await processingVideo();
    const progress: number[] = [];
    const result = await transcodeRendition(deps, data, {
      updateProgress: async (p) => void progress.push(Number(p)),
    });
    expect(result).toMatchObject({name: '360p', mp4Key: `work/${video.id}/360p.mp4`});
    expect(result.sizeBytes).toBeGreaterThan(10_000);
    expect(progress.at(-1)).toBe(100);

    const row = await t.videos.findRendition(data.renditionId);
    expect(row).toMatchObject({status: 'transcoded', progress: 100, mp4Key: result.mp4Key});
    expect((await t.videos.findById(video.id))?.progress).toBe(85);

    // The stored file is the rendition we asked for.
    const info = await probe(await t.storage.presignGet(result.mp4Key));
    expect(info).toMatchObject({width: 640, height: 360, videoCodec: 'h264', hasAudio: true});

    const events = await t.videos.listEvents(video.id);
    expect(events.at(-1)?.message).toMatch(/360p encoded in .*s, .* MB \(.*× realtime\)/);
    expect(await readdir(tmpDir)).toEqual([]);
  });

  it('reuses a finished rendition on retry', async () => {
    const {data} = await processingVideo();
    const first = await transcodeRendition(deps, data);
    const again = await transcodeRendition({...deps, preset: 'nonsense'}, data);
    expect(again).toEqual(first);
  });

  it('stops when the video is canceled mid-encode', async () => {
    const {video, data} = await processingVideo('720p', {width: 1280, height: 720});
    await t.videos.transition(video.id, 'canceled');
    await expect(transcodeRendition(deps, data)).rejects.toMatchObject({
      name: 'UnrecoverableError',
      message: 'Video is canceled',
    });
  });

  it('aborts FFmpeg when the video is canceled during the encode', async () => {
    const {video, data} = await processingVideo('720p', {width: 1280, height: 720});
    // Slow settings so the encode is still running when the cancel lands.
    const slow = {...deps, preset: 'slow', threads: 1};
    const run = transcodeRendition(slow, data, {
      updateProgress: async () => {
        await t.videos.transition(video.id, 'canceled');
      },
    });
    await expect(run).rejects.toThrow('Video was canceled during encoding');
    expect(await t.videos.findRendition(data.renditionId)).toMatchObject({status: 'failed'});
    expect(await readdir(tmpDir)).toEqual([]);
  });

  it('cleans up after a failed encode', async () => {
    const {data} = await processingVideo();
    await expect(transcodeRendition({...deps, preset: 'nonsense'}, data)).rejects.toThrow();
    expect(await readdir(tmpDir)).toEqual([]);
  });
});

describe('sweepTempDirs', () => {
  it('removes old leftovers only', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vf-sweep-'));
    await mkdir(join(dir, 'vidflow-transcode-old'));
    await mkdir(join(dir, 'vidflow-transcode-new'));
    await mkdir(join(dir, 'unrelated'));
    const old = new Date(Date.now() - 7 * 3600_000);
    await utimes(join(dir, 'vidflow-transcode-old'), old, old);
    expect(await sweepTempDirs(dir)).toBe(1);
    expect((await readdir(dir)).sort()).toEqual(['unrelated', 'vidflow-transcode-new']);
  });
});
