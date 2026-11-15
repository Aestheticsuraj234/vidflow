const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const httpFlags = (input: string) =>
  /^https?:/.test(input) ? ['-reconnect', '1', '-reconnect_on_network_error', '1'] : [];

/**
 * When to grab the poster: 10% in, at least 1 s, never past the end. The very
 * first frame is often black or a fade-in.
 */
export function posterTimeSec(durationMs: number): number {
  const duration = durationMs / 1000;
  return Math.max(0, Math.min(duration - 0.1, Math.max(1, duration * 0.1)));
}

/**
 * Poster JPEG. `thumbnail=N` looks at N frames after the seek point and keeps
 * the most representative one, which skips flashes and black frames.
 */
export function posterArgs(
  input: string,
  output: string,
  atSec: number,
  maxWidth = 1280,
): string[] {
  return [
    '-y',
    ...httpFlags(input),
    '-ss',
    atSec.toFixed(3),
    '-i',
    input,
    '-vf',
    `thumbnail=30,scale='min(${maxWidth},iw)':-2`,
    '-frames:v',
    '1',
    '-q:v',
    '3',
    output,
  ];
}

export interface SpritePlan {
  /** Seconds between tiles. */
  interval: number;
  count: number;
  columns: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
}

/**
 * One sprite sheet of at most `maxTiles` frames: one tile per second for short
 * videos, spread evenly for long ones.
 */
export function planSprite(
  durationMs: number,
  width: number,
  height: number,
  {
    maxTiles = 100,
    tileWidth = 160,
    columns = 10,
  }: {maxTiles?: number; tileWidth?: number; columns?: number} = {},
): SpritePlan {
  const duration = Math.max(durationMs / 1000, 0.1);
  const interval = Math.max(1, Math.ceil(duration / maxTiles));
  const count = Math.max(1, Math.ceil(duration / interval));
  const cols = Math.min(columns, count);
  return {
    interval,
    count,
    columns: cols,
    rows: Math.ceil(count / cols),
    tileWidth,
    tileHeight: even((tileWidth * height) / width),
  };
}

/**
 * Sprite sheet: a frame every `interval` seconds, tiled into a grid. Long
 * videos decode keyframes only, which is many times faster.
 */
export function spriteArgs(
  input: string,
  output: string,
  plan: SpritePlan,
  durationMs: number,
): string[] {
  const keyframesOnly = durationMs > 10 * 60_000 ? ['-skip_frame', 'nokey'] : [];
  return [
    '-y',
    ...httpFlags(input),
    ...keyframesOnly,
    '-i',
    input,
    '-an',
    '-vf',
    `fps=1/${plan.interval},scale=${plan.tileWidth}:${plan.tileHeight},tile=${plan.columns}x${plan.rows}`,
    '-frames:v',
    '1',
    '-q:v',
    '4',
    output,
  ];
}

function timestamp(sec: number): string {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms % 1000, 3)}`;
}

/**
 * WebVTT mapping each time range to its tile (`sprite.jpg#xywh=…`). Players
 * such as Video.js, Vidstack and our own scrubber read this to show previews
 * on hover.
 */
export function spriteVtt(plan: SpritePlan, durationMs: number, spriteUrl = 'sprite.jpg'): string {
  const duration = durationMs / 1000;
  const cues = ['WEBVTT', ''];
  for (let i = 0; i < plan.count; i++) {
    const start = i * plan.interval;
    const end = Math.min((i + 1) * plan.interval, duration);
    const x = (i % plan.columns) * plan.tileWidth;
    const y = Math.floor(i / plan.columns) * plan.tileHeight;
    cues.push(
      `${timestamp(start)} --> ${timestamp(end)}`,
      `${spriteUrl}#xywh=${x},${y},${plan.tileWidth},${plan.tileHeight}`,
      '',
    );
  }
  return cues.join('\n');
}
