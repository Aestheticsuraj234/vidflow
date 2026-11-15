import {execFileSync} from 'node:child_process';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {planSprite, posterArgs, posterTimeSec, runFfmpeg, spriteArgs, spriteVtt} from '../src';
import {fixture} from '../src/testing';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vf-thumbs-'));
});
afterAll(() => rm(dir, {recursive: true, force: true}));

function size(path: string): [number, number] {
  const out = execFileSync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'stream=width,height',
    '-of',
    'csv=p=0',
    path,
  ]);
  const [w, h] = out.toString().trim().split(',').map(Number);
  return [w ?? 0, h ?? 0];
}

describe('poster', () => {
  it('picks a time 10% in, at least 1 s, never past the end', () => {
    expect(posterTimeSec(60_000)).toBe(6);
    expect(posterTimeSec(3000)).toBe(1);
    expect(posterTimeSec(500)).toBeCloseTo(0.4);
  });

  it('writes a JPEG no wider than the limit', async () => {
    const out = join(dir, 'poster.jpg');
    await runFfmpeg(posterArgs(fixture('landscape.mp4'), out, 1, 640));
    expect(size(out)).toEqual([640, 360]);
  });
});

describe('sprite', () => {
  it('plans one tile per second for short videos', () => {
    expect(planSprite(3000, 1280, 720)).toEqual({
      interval: 1,
      count: 3,
      columns: 3,
      rows: 1,
      tileWidth: 160,
      tileHeight: 90,
    });
  });

  it('spreads at most 100 tiles over long videos', () => {
    const plan = planSprite(2 * 3600_000, 1920, 1080);
    expect(plan.count).toBeLessThanOrEqual(100);
    expect(plan.interval).toBe(72);
    expect(plan).toMatchObject({columns: 10, rows: 10});
  });

  it('keeps portrait tiles portrait', () => {
    expect(planSprite(10_000, 720, 1280)).toMatchObject({tileWidth: 160, tileHeight: 284});
  });

  it('renders the grid', async () => {
    const plan = planSprite(3000, 1280, 720);
    const out = join(dir, 'sprite.jpg');
    await runFfmpeg(spriteArgs(fixture('landscape.mp4'), out, plan, 3000));
    expect(size(out)).toEqual([480, 90]);
  });

  it('writes WebVTT cues pointing at each tile', () => {
    const plan = planSprite(12_500, 1280, 720, {columns: 10});
    const vtt = spriteVtt(plan, 12_500);
    expect(
      vtt.startsWith('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nsprite.jpg#xywh=0,0,160,90\n'),
    ).toBe(true);
    expect(vtt).toContain('00:00:10.000 --> 00:00:11.000\nsprite.jpg#xywh=0,90,160,90');
    expect(vtt).toContain('00:00:12.000 --> 00:00:12.500\nsprite.jpg#xywh=320,90,160,90');
  });
});
