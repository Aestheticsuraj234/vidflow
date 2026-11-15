import {readFile, stat} from 'node:fs/promises';
import {join} from 'node:path';

export const HLS_TYPES = {
  playlist: 'application/vnd.apple.mpegurl',
  segment: 'video/iso.segment',
  init: 'video/mp4',
} as const;

/**
 * FFmpeg arguments that cut an already-encoded MP4 into fMP4 HLS without
 * re-encoding (`-c copy`). Segments break on keyframes, and the transcode
 * stage put one every `segmentSeconds`, so every rendition cuts at the same
 * instants.
 */
export function hlsArgs(input: string, outDir: string, segmentSeconds = 2): string[] {
  // Reconnect flags only exist for HTTP inputs (a presigned URL in production).
  const net = /^https?:/.test(input)
    ? ['-reconnect', '1', '-reconnect_on_network_error', '1', '-reconnect_delay_max', '10']
    : [];
  return [
    '-y',
    ...net,
    '-i',
    input,
    '-map',
    '0',
    '-c',
    'copy',
    '-f',
    'hls',
    '-hls_time',
    String(segmentSeconds),
    '-hls_playlist_type',
    'vod',
    '-hls_segment_type',
    'fmp4',
    '-hls_fmp4_init_filename',
    'init.mp4',
    '-hls_segment_filename',
    join(outDir, 'seg_%05d.m4s'),
    '-hls_flags',
    'independent_segments',
    join(outDir, 'index.m3u8'),
  ];
}

export interface PlaylistSegment {
  uri: string;
  durationSec: number;
}

/** Segments of a media playlist, in order. */
export function parseMediaPlaylist(text: string): PlaylistSegment[] {
  const segments: PlaylistSegment[] = [];
  let duration: number | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#EXTINF:')) {
      duration = Number.parseFloat(line.slice(8));
    } else if (line && !line.startsWith('#') && duration !== null) {
      segments.push({uri: line, durationSec: duration});
      duration = null;
    }
  }
  return segments;
}

export interface Bandwidth {
  /** Highest bitrate of any segment, bits/s: HLS `BANDWIDTH`. */
  peak: number;
  /** Total bits / total duration: HLS `AVERAGE-BANDWIDTH`. */
  average: number;
  segments: number;
  durationSec: number;
}

/** Measures real bitrates from the segment files on disk. */
export async function measureBandwidth(dir: string): Promise<Bandwidth> {
  const segments = parseMediaPlaylist(await readFile(join(dir, 'index.m3u8'), 'utf8'));
  if (segments.length === 0) throw new Error(`No segments in ${dir}`);
  let peak = 0;
  let totalBits = 0;
  let totalSec = 0;
  for (const seg of segments) {
    const bits = (await stat(join(dir, seg.uri))).size * 8;
    totalBits += bits;
    totalSec += seg.durationSec;
    // Very short final segments exaggerate the peak; judge them as 1 s minimum.
    peak = Math.max(peak, bits / Math.max(seg.durationSec, 1));
  }
  return {
    peak: Math.ceil(peak),
    average: Math.ceil(totalBits / totalSec),
    segments: segments.length,
    durationSec: totalSec,
  };
}

const PROFILE_IDC: Record<string, string> = {
  Baseline: '42',
  'Constrained Baseline': '42',
  Main: '4d',
  High: '64',
};

/** RFC 6381 codec string for H.264, e.g. `avc1.64001f` for High@3.1. */
export function avcCodec(profile: string | null, level: number | null): string {
  const idc = PROFILE_IDC[profile ?? ''] ?? '64';
  const constraints = idc === '42' ? 'e0' : '00';
  const lvl = (level ?? 40).toString(16).padStart(2, '0');
  return `avc1.${idc}${constraints}${lvl}`;
}

export interface Variant {
  uri: string;
  bandwidth: number;
  averageBandwidth: number;
  width: number;
  height: number;
  fps: number;
  codecs: string;
}

/** Master playlist listing every rendition, best first. */
export function buildMasterPlaylist(variants: Variant[]): string {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:7', '#EXT-X-INDEPENDENT-SEGMENTS', ''];
  for (const v of [...variants].sort((a, b) => b.bandwidth - a.bandwidth)) {
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${v.bandwidth},AVERAGE-BANDWIDTH=${v.averageBandwidth},` +
        `RESOLUTION=${v.width}x${v.height},FRAME-RATE=${v.fps.toFixed(3)},CODECS="${v.codecs}"`,
      v.uri,
    );
  }
  return `${lines.join('\n')}\n`;
}

/** Content type for a file in an HLS output folder. */
export function hlsContentType(fileName: string): string {
  if (fileName.endsWith('.m3u8')) return HLS_TYPES.playlist;
  if (fileName.endsWith('.m4s')) return HLS_TYPES.segment;
  return HLS_TYPES.init;
}
