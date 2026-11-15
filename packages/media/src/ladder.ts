import type {MediaInfo} from './probe';

export interface Rung {
  /** Short side in pixels: 720 for 1280×720 and for 720×1280. */
  short: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
}

/** The default ladder for 16:9 content (bitrates for H.264 at 30 fps). */
export const DEFAULT_LADDER: Rung[] = [
  {short: 1080, videoBitrateKbps: 5000, audioBitrateKbps: 128},
  {short: 720, videoBitrateKbps: 2800, audioBitrateKbps: 128},
  {short: 480, videoBitrateKbps: 1400, audioBitrateKbps: 96},
  {short: 360, videoBitrateKbps: 800, audioBitrateKbps: 96},
  {short: 240, videoBitrateKbps: 400, audioBitrateKbps: 64},
];

export interface RenditionPlan {
  name: string;
  width: number;
  height: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * Picks the renditions for a source:
 * - never upscales: only rungs whose short side fits the source
 * - keeps the source's aspect ratio and orientation (portrait stays portrait)
 * - scales bitrate with pixel count relative to 16:9, and caps it a little above the source
 * - at most `max` rungs; always at least one (the source size for tiny videos)
 */
export function planRenditions(
  info: Pick<MediaInfo, 'width' | 'height' | 'fps' | 'hasAudio' | 'videoBitrateKbps'>,
  {ladder = DEFAULT_LADDER, max = 4}: {ladder?: Rung[]; max?: number} = {},
): RenditionPlan[] {
  const portrait = info.height > info.width;
  const short = Math.min(info.width, info.height);
  const aspect = Math.max(info.width, info.height) / short;
  const fpsFactor = info.fps > 40 ? 1.5 : 1;

  const fitting = ladder.filter((r) => r.short <= short).slice(0, max);
  const rungs: Rung[] =
    fitting.length > 0 ? fitting : [{...(ladder.at(-1) ?? DEFAULT_LADDER[4]!), short: even(short)}];

  return rungs.map((rung) => {
    const s = rung.short;
    const l = even(s * aspect);
    const width = portrait ? s : l;
    const height = portrait ? l : s;
    const pixelFactor = (width * height) / ((s * 16) / 9) / s;
    let video = Math.round(rung.videoBitrateKbps * pixelFactor * fpsFactor);
    if (info.videoBitrateKbps)
      video = Math.min(video, Math.max(300, Math.round(info.videoBitrateKbps * 1.2)));
    return {
      name: `${s}p`,
      width,
      height,
      videoBitrateKbps: video,
      audioBitrateKbps: info.hasAudio ? rung.audioBitrateKbps : 0,
    };
  });
}

/** Keyframe every `segmentSeconds` so every rendition cuts segments at the same instants. */
export function gopFrames(fps: number, segmentSeconds = 2): number {
  return Math.max(1, Math.round(fps * segmentSeconds));
}
