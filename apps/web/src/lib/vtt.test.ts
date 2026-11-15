import {describe, expect, it} from 'vitest';

import {cueAt, parsePreviewVtt} from './vtt';

const vtt = `WEBVTT

00:00:00.000 --> 00:00:01.000
sprite.jpg#xywh=0,0,160,90

00:00:01.000 --> 00:00:02.000
sprite.jpg#xywh=160,0,160,90

00:01:02.000 --> 00:01:02.500
sprite.jpg#xywh=0,90,160,90
`;

describe('preview VTT', () => {
  const cues = parsePreviewVtt(vtt, 'https://cdn.example.com/public/videos/v1/sprite.vtt');

  it('parses cues and resolves the sprite URL', () => {
    expect(cues).toHaveLength(3);
    expect(cues[1]).toEqual({
      start: 1,
      end: 2,
      url: 'https://cdn.example.com/public/videos/v1/sprite.jpg',
      x: 160,
      y: 0,
      w: 160,
      h: 90,
    });
    expect(cues[2]).toMatchObject({start: 62, end: 62.5, y: 90});
  });

  it('finds the cue for a time', () => {
    expect(cueAt(cues, 0.5)?.x).toBe(0);
    expect(cueAt(cues, 1.2)?.x).toBe(160);
    expect(cueAt(cues, 62.1)?.y).toBe(90);
    expect(cueAt(cues, 99)?.y).toBe(90);
    expect(cueAt([], 1)).toBeUndefined();
  });
});
