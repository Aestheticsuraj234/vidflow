import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

import {z} from 'zod';

const run = promisify(execFile);

const streamSchema = z.object({
  codec_type: z.string(),
  codec_name: z.string().optional(),
  profile: z.string().optional(),
  level: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  avg_frame_rate: z.string().optional(),
  r_frame_rate: z.string().optional(),
  bit_rate: z.string().optional(),
  tags: z.record(z.string(), z.string()).optional(),
  side_data_list: z.array(z.object({rotation: z.number().optional()}).loose()).optional(),
  disposition: z.object({attached_pic: z.number().optional()}).loose().optional(),
});

const probeSchema = z.object({
  streams: z.array(streamSchema.loose()).default([]),
  format: z
    .object({
      format_name: z.string().optional(),
      duration: z.string().optional(),
      bit_rate: z.string().optional(),
    })
    .loose()
    .optional(),
});

/** What the pipeline needs to know about a source file. */
export interface MediaInfo {
  formatName: string;
  durationMs: number;
  /** Display size: width and height after applying rotation. */
  width: number;
  height: number;
  /** Rotation in degrees from the container (0, 90, 180, 270). */
  rotation: number;
  fps: number;
  videoCodec: string;
  videoBitrateKbps: number | null;
  /** e.g. "High", and level ×10 (31 = 3.1). For the HLS CODECS attribute. */
  videoProfile: string | null;
  videoLevel: number | null;
  hasAudio: boolean;
  audioCodec: string | null;
}

export class ProbeError extends Error {
  constructor(
    message: string,
    /** True when the file itself is unusable: retrying won't help. */
    readonly invalidMedia: boolean,
  ) {
    super(message);
    this.name = 'ProbeError';
  }
}

/** "30000/1001" → 29.97. */
export function parseRate(rate: string | undefined): number {
  if (!rate) return 0;
  const [num, den] = rate.split('/').map(Number);
  if (!num || !den) return Number(rate) || 0;
  return num / den;
}

function normaliseRotation(degrees: number): number {
  return (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;
}

/** Turns raw ffprobe JSON into `MediaInfo`, or throws a `ProbeError`. */
export function parseProbe(json: unknown): MediaInfo {
  const parsed = probeSchema.safeParse(json);
  if (!parsed.success) throw new ProbeError('ffprobe returned unexpected output', true);
  const {streams, format} = parsed.data;

  // Cover art in MP3/M4A shows up as a one-frame video stream; ignore it.
  const video = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  if (!video || !video.width || !video.height) {
    throw new ProbeError('No video stream found', true);
  }
  const audio = streams.find((s) => s.codec_type === 'audio');

  const durationSec = Number(format?.duration ?? 0);
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new ProbeError('Could not read the video duration', true);
  }

  const rotation = normaliseRotation(
    video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ??
      Number(video.tags?.rotate ?? 0),
  );
  const swap = rotation === 90 || rotation === 270;
  const fps = parseRate(video.avg_frame_rate) || parseRate(video.r_frame_rate);
  const bitrate = Number(video.bit_rate ?? format?.bit_rate ?? 0);

  return {
    formatName: format?.format_name ?? 'unknown',
    durationMs: Math.round(durationSec * 1000),
    width: swap ? video.height : video.width,
    height: swap ? video.width : video.height,
    rotation,
    fps: fps > 0 && fps < 1000 ? Math.round(fps * 1000) / 1000 : 30,
    videoCodec: video.codec_name ?? 'unknown',
    videoBitrateKbps: bitrate > 0 ? Math.round(bitrate / 1000) : null,
    videoProfile: video.profile ?? null,
    videoLevel: video.level && video.level > 0 ? video.level : null,
    hasAudio: Boolean(audio),
    audioCodec: audio?.codec_name ?? null,
  };
}

export interface ProbeOptions {
  ffprobePath?: string;
  timeoutMs?: number;
}

/**
 * Runs ffprobe on a local path or a URL (a presigned GET works, so nothing
 * has to be downloaded first).
 */
export async function probe(input: string, options: ProbeOptions = {}): Promise<MediaInfo> {
  const {ffprobePath = process.env.FFPROBE_PATH ?? 'ffprobe', timeoutMs = 60_000} = options;
  let stdout: string;
  try {
    ({stdout} = await run(
      ffprobePath,
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', input],
      {timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024},
    ));
  } catch (err) {
    const e = err as {code?: string | number; stderr?: string; killed?: boolean};
    if (e.code === 'ENOENT') throw new ProbeError(`ffprobe not found at "${ffprobePath}"`, false);
    if (e.killed) throw new ProbeError('ffprobe timed out', false);
    const detail = (e.stderr ?? '').trim().split('\n').at(-1) ?? 'unknown error';
    // Network problems are worth retrying; anything else means a bad file.
    const transient = /Connection|timed out|Server returned 5|resolve/i.test(detail);
    throw new ProbeError(
      transient ? `Could not read the source: ${detail}` : `Not a readable video: ${detail}`,
      !transient,
    );
  }
  return parseProbe(JSON.parse(stdout));
}
