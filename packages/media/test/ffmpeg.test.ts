import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {
  FfmpegError,
  h264Args,
  parseProgressBlock,
  probe,
  runFfmpeg,
  type FfmpegProgress,
} from '../src';
import {fixture} from '../src/testing';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vf-ffmpeg-'));
});
afterAll(() => rm(dir, {recursive: true, force: true}));

/** Keyframe timestamps of the first video stream. */
async function keyframes(path: string): Promise<number[]> {
  const {execFile} = await import('node:child_process');
  const out = await new Promise<string>((resolve, reject) =>
    execFile(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-skip_frame',
        'nokey',
        '-show_entries',
        'frame=pts_time',
        '-of',
        'csv=p=0',
        path,
      ],
      (err, stdout) => (err ? reject(err) : resolve(stdout)),
    ),
  );
  return out
    .trim()
    .split('\n')
    .map((l) => Number.parseFloat(l));
}

describe('parseProgressBlock', () => {
  it('computes percent from out_time_us', () => {
    expect(
      parseProgressBlock(
        {out_time_us: '1500000', speed: '2.5x', fps: '60', progress: 'continue'},
        3000,
      ),
    ).toEqual({
      outTimeMs: 1500,
      percent: 50,
      speed: 2.5,
      fps: 60,
    });
  });

  it('reports 100 only at the end, and ignores N/A', () => {
    expect(parseProgressBlock({out_time_us: '3000000', progress: 'continue'}, 3000)?.percent).toBe(
      99,
    );
    expect(parseProgressBlock({out_time_us: '3000000', progress: 'end'}, 3000)?.percent).toBe(100);
    expect(parseProgressBlock({out_time_us: 'N/A', progress: 'continue'}, 3000)).toBeNull();
  });
});

describe('runFfmpeg + h264Args', () => {
  it('encodes a rendition with aligned keyframes and reports progress', async () => {
    const out = join(dir, '360p.mp4');
    const progress: FfmpegProgress[] = [];
    await runFfmpeg(
      h264Args(
        fixture('landscape.mp4'),
        out,
        {width: 640, height: 360, videoBitrateKbps: 800, audioBitrateKbps: 96},
        {gopFrames: 60, preset: 'ultrafast'},
      ),
      {durationMs: 3000, onProgress: (p) => progress.push(p)},
    );
    const info = await probe(out);
    expect(info).toMatchObject({
      width: 640,
      height: 360,
      videoCodec: 'h264',
      audioCodec: 'aac',
      fps: 30,
    });
    expect(progress.at(-1)?.percent).toBe(100);
    // 3 s at 30 fps with a 60-frame GOP: keyframes at 0 and 2 s only.
    expect(await keyframes(out)).toEqual([0, 2]);
  });

  it('drops audio when the rendition has none', async () => {
    const out = join(dir, 'silent.mp4');
    await runFfmpeg(
      h264Args(
        fixture('landscape.mp4'),
        out,
        {width: 426, height: 240, videoBitrateKbps: 300, audioBitrateKbps: 0},
        {gopFrames: 60, preset: 'ultrafast'},
      ),
    );
    expect((await probe(out)).hasAudio).toBe(false);
  });

  it('turns rotated phone video upright', async () => {
    const out = join(dir, 'rotated.mp4');
    await runFfmpeg(
      h264Args(
        fixture('rotated.mp4'),
        out,
        {width: 360, height: 640, videoBitrateKbps: 500, audioBitrateKbps: 64},
        {gopFrames: 60, preset: 'ultrafast'},
      ),
    );
    expect(await probe(out)).toMatchObject({width: 360, height: 640, rotation: 0});
  });

  it('fails with the reason from stderr', async () => {
    const err = await runFfmpeg(['-i', fixture('not-a-video.mp4'), join(dir, 'x.mp4')]).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(FfmpegError);
    expect((err as FfmpegError).message).toMatch(/Invalid data|exited with/);
  });

  it('kills the process on abort', async () => {
    const controller = new AbortController();
    const out = join(dir, 'aborted.mp4');
    const run = runFfmpeg(['-y', '-re', '-f', 'lavfi', '-i', 'testsrc2=rate=30', '-t', '30', out], {
      signal: controller.signal,
    });
    const started = Date.now();
    setTimeout(() => controller.abort(), 300);
    await expect(run).rejects.toThrow('Aborted');
    // A 30 s real-time encode stopped within a few seconds of the abort.
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('enforces a timeout', async () => {
    await expect(
      runFfmpeg(['-y', '-re', '-f', 'lavfi', '-i', 'testsrc2', '-t', '30', join(dir, 't.mp4')], {
        timeoutMs: 300,
      }),
    ).rejects.toThrow(/Timed out/);
  });

  it('reports a missing binary clearly', async () => {
    await expect(runFfmpeg(['-version'], {ffmpegPath: '/nope/ffmpeg'})).rejects.toThrow(
      /not found/,
    );
  });
});
