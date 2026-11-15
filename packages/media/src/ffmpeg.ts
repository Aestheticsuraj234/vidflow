import {spawn} from 'node:child_process';

export class FfmpegError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
    /** Last lines of stderr, for logs and the video timeline. */
    readonly stderrTail: string,
  ) {
    super(message);
    this.name = 'FfmpegError';
  }
}

export interface FfmpegProgress {
  /** Media time encoded so far. */
  outTimeMs: number;
  /** 0–100 when the input duration is known. */
  percent: number;
  /** Encoding speed relative to real time (2 = twice as fast as playback). */
  speed: number | null;
  fps: number | null;
}

export interface RunFfmpegOptions {
  ffmpegPath?: string;
  /** Input duration, to turn time encoded into a percentage. */
  durationMs?: number;
  onProgress?: (p: FfmpegProgress) => void;
  signal?: AbortSignal;
  /** Hard limit; the process is killed after this. */
  timeoutMs?: number;
}

/**
 * `ffmpeg -progress pipe:1` prints blocks of `key=value` lines ending in
 * `progress=continue` or `progress=end`. This parses one block.
 */
export function parseProgressBlock(
  block: Record<string, string>,
  durationMs?: number,
): FfmpegProgress | null {
  // out_time_us is microseconds; older builds put microseconds in out_time_ms too.
  const raw = block.out_time_us ?? block.out_time_ms;
  if (raw === undefined || raw === 'N/A') return null;
  const outTimeMs = Math.max(0, Math.round(Number(raw) / 1000));
  if (!Number.isFinite(outTimeMs)) return null;
  const speed = Number.parseFloat(block.speed ?? '');
  const fps = Number.parseFloat(block.fps ?? '');
  const percent =
    block.progress === 'end'
      ? 100
      : durationMs
        ? Math.min(99, Math.floor((outTimeMs / durationMs) * 100))
        : 0;
  return {
    outTimeMs,
    percent,
    speed: Number.isFinite(speed) ? speed : null,
    fps: Number.isFinite(fps) ? fps : null,
  };
}

/**
 * Runs FFmpeg, reporting progress as it goes. Rejects with `FfmpegError` on a
 * non-zero exit, abort or timeout; the child is always killed on the way out.
 */
export function runFfmpeg(args: string[], options: RunFfmpegOptions = {}): Promise<void> {
  const {
    ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg',
    durationMs,
    onProgress,
    signal,
  } = options;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new FfmpegError('Aborted before start', null, ''));
      return;
    }
    const child = spawn(ffmpegPath, ['-hide_banner', '-nostats', '-progress', 'pipe:1', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    let buffer = '';
    let block: Record<string, string> = {};
    let reason: string | null = null;

    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      // Keep only the tail: FFmpeg can be chatty over a long encode.
      stderr = (stderr + chunk).slice(-8000);
    });
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        const eq = line.indexOf('=');
        if (eq < 0) continue;
        const key = line.slice(0, eq);
        block[key] = line.slice(eq + 1);
        if (key === 'progress') {
          const p = parseProgressBlock(block, durationMs);
          if (p) onProgress?.(p);
          block = {};
        }
      }
    });

    const kill = (why: string) => {
      reason ??= why;
      child.kill('SIGKILL');
    };
    const onAbort = () => kill('Aborted');
    signal?.addEventListener('abort', onAbort, {once: true});
    const timer = options.timeoutMs
      ? setTimeout(() => kill(`Timed out after ${options.timeoutMs} ms`), options.timeoutMs)
      : null;

    const finish = () => {
      signal?.removeEventListener('abort', onAbort);
      if (timer) clearTimeout(timer);
    };

    child.on('error', (err: NodeJS.ErrnoException) => {
      finish();
      reject(
        new FfmpegError(
          err.code === 'ENOENT' ? `ffmpeg not found at "${ffmpegPath}"` : err.message,
          null,
          stderr,
        ),
      );
    });
    child.on('close', (code) => {
      finish();
      if (code === 0 && !reason) {
        resolve();
        return;
      }
      const tail = stderr.trim().split('\n').slice(-5).join('\n');
      const last = tail.split('\n').at(-1) ?? '';
      reject(new FfmpegError(reason ?? `ffmpeg exited with ${code}: ${last}`, code, tail));
    });
  });
}
