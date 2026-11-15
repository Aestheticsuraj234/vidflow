export interface EncodeTarget {
  width: number;
  height: number;
  videoBitrateKbps: number;
  /** 0 means no audio track. */
  audioBitrateKbps: number;
}

export interface H264Options {
  gopFrames: number;
  /** x264 speed/quality trade-off: ultrafast … veryslow. */
  preset?: string;
  /** 0 lets x264 decide (one per core). */
  threads?: number;
  /** Network inputs: reconnect when the connection drops mid-read. */
  inputIsUrl?: boolean;
}

/**
 * FFmpeg arguments for one H.264/AAC rendition in MP4.
 *
 * - capped VBR: `-b:v` target, `-maxrate` ~7% above, `-bufsize` 1.5× (HLS-friendly)
 * - fixed GOP with scene-cut keyframes off, so every rendition has keyframes at
 *   exactly the same instants and HLS segments line up across qualities
 * - `yuv420p` and High profile: plays everywhere
 * - FFmpeg auto-rotates, so the rotated phone video comes out upright at the
 *   display size the probe reported
 */
export function h264Args(
  input: string,
  output: string,
  target: EncodeTarget,
  {gopFrames, preset = 'veryfast', threads = 0, inputIsUrl = false}: H264Options,
): string[] {
  const v = target.videoBitrateKbps;
  const net = inputIsUrl
    ? ['-reconnect', '1', '-reconnect_on_network_error', '1', '-reconnect_delay_max', '10']
    : [];
  const audio =
    target.audioBitrateKbps > 0
      ? [
          '-map',
          '0:a:0?',
          '-c:a',
          'aac',
          '-b:a',
          `${target.audioBitrateKbps}k`,
          '-ac',
          '2',
          '-ar',
          '48000',
        ]
      : ['-an'];
  return [
    '-y',
    ...net,
    '-i',
    input,
    '-map',
    '0:v:0',
    ...audio,
    '-vf',
    `scale=${target.width}:${target.height}:flags=lanczos,setsar=1`,
    '-c:v',
    'libx264',
    '-preset',
    preset,
    '-profile:v',
    'high',
    '-pix_fmt',
    'yuv420p',
    '-b:v',
    `${v}k`,
    '-maxrate',
    `${Math.round(v * 1.07)}k`,
    '-bufsize',
    `${Math.round(v * 1.5)}k`,
    '-g',
    String(gopFrames),
    '-keyint_min',
    String(gopFrames),
    '-sc_threshold',
    '0',
    '-threads',
    String(threads),
    '-movflags',
    '+faststart',
    output,
  ];
}
