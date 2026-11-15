import {describe, expect, it} from 'vitest';

import {gopFrames, parseRate, planRenditions, probe, ProbeError} from '../src';
import {fixture} from '../src/testing';

describe('probe', () => {
  it('reads a landscape video with audio', async () => {
    const info = await probe(fixture('landscape.mp4'));
    expect(info).toMatchObject({
      width: 1280,
      height: 720,
      rotation: 0,
      fps: 30,
      videoCodec: 'h264',
      hasAudio: true,
      audioCodec: 'aac',
    });
    expect(info.durationMs).toBeGreaterThan(2900);
  });

  it('applies rotation to the display size', async () => {
    const info = await probe(fixture('rotated.mp4'));
    expect(info).toMatchObject({width: 720, height: 1280});
    expect([90, 270]).toContain(info.rotation);
  });

  it('notices missing audio', async () => {
    const info = await probe(fixture('silent-small.mp4'));
    expect(info).toMatchObject({
      width: 320,
      height: 180,
      hasAudio: false,
      audioCodec: null,
      fps: 25,
    });
  });

  it('rejects files without video as invalid media', async () => {
    await expect(probe(fixture('audio-only.m4a'))).rejects.toMatchObject({
      message: 'No video stream found',
      invalidMedia: true,
    });
  });

  it('rejects garbage as invalid media', async () => {
    const err = await probe(fixture('not-a-video.mp4')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProbeError);
    expect(err).toMatchObject({invalidMedia: true});
  });

  it('treats a missing ffprobe as retryable', async () => {
    await expect(
      probe(fixture('landscape.mp4'), {ffprobePath: '/nope/ffprobe'}),
    ).rejects.toMatchObject({
      invalidMedia: false,
    });
  });

  it('parses frame rates', () => {
    expect(parseRate('30000/1001')).toBeCloseTo(29.97, 2);
    expect(parseRate('0/0')).toBe(0);
  });
});

describe('planRenditions', () => {
  const base = {fps: 30, hasAudio: true, videoBitrateKbps: null};

  it('never upscales a 720p source', () => {
    const plan = planRenditions({...base, width: 1280, height: 720});
    expect(plan.map((r) => r.name)).toEqual(['720p', '480p', '360p', '240p']);
    expect(plan[0]).toMatchObject({width: 1280, height: 720, videoBitrateKbps: 2800});
    expect(plan[2]).toMatchObject({width: 640, height: 360});
  });

  it('caps at four rungs from the top for 4K', () => {
    const plan = planRenditions({...base, width: 3840, height: 2160});
    expect(plan.map((r) => r.name)).toEqual(['1080p', '720p', '480p', '360p']);
  });

  it('keeps portrait videos portrait', () => {
    const [top] = planRenditions({...base, width: 1080, height: 1920});
    expect(top).toMatchObject({name: '1080p', width: 1080, height: 1920});
  });

  it('uses even dimensions for odd aspect ratios', () => {
    for (const r of planRenditions({...base, width: 1000, height: 750})) {
      expect(r.width % 2).toBe(0);
      expect(r.height % 2).toBe(0);
    }
  });

  it('gives tiny videos one rendition at source size', () => {
    expect(planRenditions({...base, width: 176, height: 144})).toEqual([
      expect.objectContaining({name: '144p', width: 176, height: 144}),
    ]);
  });

  it('drops audio bitrate for silent videos and caps bitrate near the source', () => {
    const [top] = planRenditions({
      ...base,
      hasAudio: false,
      videoBitrateKbps: 1000,
      width: 1920,
      height: 1080,
    });
    expect(top).toMatchObject({audioBitrateKbps: 0, videoBitrateKbps: 1200});
  });

  it('gives high frame rates more bits', () => {
    const [a] = planRenditions({...base, width: 1280, height: 720});
    const [b] = planRenditions({...base, fps: 60, width: 1280, height: 720});
    expect(b!.videoBitrateKbps).toBe(a!.videoBitrateKbps * 1.5);
  });

  it('aligns keyframes to 2 s segments', () => {
    expect(gopFrames(30)).toBe(60);
    expect(gopFrames(29.97)).toBe(60);
    expect(gopFrames(25)).toBe(50);
  });
});
