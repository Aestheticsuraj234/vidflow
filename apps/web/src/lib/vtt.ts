export interface PreviewCue {
  start: number;
  end: number;
  /** Absolute URL of the sprite image. */
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function seconds(ts: string): number {
  const parts = ts.trim().split(':').map(Number);
  return parts.reduce((total, n) => total * 60 + n, 0);
}

/** Parses a thumbnail WebVTT (`sprite.jpg#xywh=x,y,w,h` cues). Relative URLs resolve against `base`. */
export function parsePreviewVtt(text: string, base: string): PreviewCue[] {
  const cues: PreviewCue[] = [];
  const blocks = text.replace(/\r/g, '').split('\n\n');
  for (const block of blocks) {
    const lines = block.split('\n').filter(Boolean);
    const timing = lines.findIndex((l) => l.includes('-->'));
    const target = lines[timing + 1];
    if (timing < 0 || !target) continue;
    const [from = '', to = ''] = lines[timing]!.split('-->');
    const [path = '', hash = ''] = target.split('#xywh=');
    const [x = 0, y = 0, w = 0, h = 0] = hash.split(',').map(Number);
    cues.push({
      start: seconds(from),
      end: seconds(to),
      url: new URL(path, base).toString(),
      x,
      y,
      w,
      h,
    });
  }
  return cues;
}

/** The cue covering `time`, by binary search. */
export function cueAt(cues: PreviewCue[], time: number): PreviewCue | undefined {
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cue = cues[mid]!;
    if (time < cue.start) hi = mid - 1;
    else if (time >= cue.end) lo = mid + 1;
    else return cue;
  }
  return cues.at(-1) && time >= cues.at(-1)!.end ? cues.at(-1) : undefined;
}
