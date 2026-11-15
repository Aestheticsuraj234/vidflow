import {mkdir, mkdtemp, readdir, rm, stat} from 'node:fs/promises';
import {join} from 'node:path';

import type {VideoRepository} from '@vidflow/db';
import {FfmpegError, h264Args, runFfmpeg} from '@vidflow/media';
import {
  UnrecoverableError,
  type Job,
  type JobData,
  type JobResults,
  type TranscodeResult,
} from '@vidflow/queues';
import {CACHE, keys, type StorageProvider} from '@vidflow/storage';

export interface TranscodeDeps {
  videos: VideoRepository;
  storage: StorageProvider;
  tmpDir: string;
  preset: string;
  threads: number;
  timeoutMs: number;
  /** Reports encode speed (seconds of video per second of work) for metrics. */
  onEncoded?: (rendition: string, realtime: number) => void;
  /** How often progress is written to Redis and Postgres. */
  progressIntervalMs?: number;
}

const TMP_PREFIX = 'vidflow-transcode-';
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * Transcode stage: one rendition of one video to an MP4 in `work/`.
 *
 * Reads the source straight from a presigned URL, reports progress, notices
 * when the video is canceled mid-encode, and always cleans its temp folder.
 */
export async function transcodeRendition(
  deps: TranscodeDeps,
  data: JobData<'transcode'>,
  job?: Pick<Job<JobData<'transcode'>, JobResults['transcode']>, 'updateProgress'>,
): Promise<TranscodeResult> {
  const {videos, storage} = deps;
  const {videoId, renditionId, rendition, gopFrames} = data;

  const video = await videos.findById(videoId);
  if (!video?.sourceKey) throw new UnrecoverableError(`Video ${videoId} not found`);
  if (video.status === 'canceled' || video.status === 'failed') {
    throw new UnrecoverableError(`Video is ${video.status}`);
  }
  const row = await videos.findRendition(renditionId);
  if (!row) throw new UnrecoverableError(`Rendition ${renditionId} not found`);

  const mp4Key = keys.renditionMp4(videoId, rendition.name);

  // Already done (a retry after the upload succeeded): reuse it.
  if (row.status === 'transcoded' && row.mp4Key) {
    const existing = await storage.head(row.mp4Key);
    if (existing) {
      return {
        renditionId,
        name: rendition.name,
        mp4Key: row.mp4Key,
        sizeBytes: existing.sizeBytes,
        encodeMs: row.encodeMs ?? 0,
      };
    }
  }

  await videos.updateRendition(renditionId, {status: 'transcoding', progress: 0});
  await mkdir(deps.tmpDir, {recursive: true});
  const dir = await mkdtemp(join(deps.tmpDir, TMP_PREFIX));
  const output = join(dir, `${rendition.name}.mp4`);
  const controller = new AbortController();
  const started = Date.now();
  const interval = deps.progressIntervalMs ?? 2000;
  let lastReport = 0;
  let reporting: Promise<void> = Promise.resolve();

  try {
    const input = await storage.presignGet(video.sourceKey, 6 * 3600);
    await runFfmpeg(
      h264Args(input, output, rendition, {
        gopFrames,
        preset: deps.preset,
        threads: deps.threads,
        inputIsUrl: true,
      }),
      {
        durationMs: video.durationMs ?? undefined,
        timeoutMs: deps.timeoutMs,
        signal: controller.signal,
        onProgress: (p) => {
          const now = Date.now();
          if (now - lastReport < interval) return;
          lastReport = now;
          // Serialise reports so a slow DB never piles up writes.
          reporting = reporting.then(async () => {
            await job?.updateProgress(p.percent);
            await videos.updateRendition(renditionId, {progress: p.percent});
            await videos.refreshProgress(videoId);
            // Canceled while encoding? Stop burning CPU.
            const current = await videos.findById(videoId);
            if (current?.status === 'canceled' || current?.status === 'failed') {
              controller.abort();
            }
          });
        },
      },
    );
    await reporting;

    const {size} = await stat(output);
    await storage.putFile(mp4Key, output, {contentType: 'video/mp4', cacheControl: CACHE.private});
    const encodeMs = Date.now() - started;
    await videos.updateRendition(renditionId, {
      status: 'transcoded',
      progress: 100,
      mp4Key,
      sizeBytes: size,
      encodeMs,
    });
    await videos.refreshProgress(videoId);
    if (video.durationMs) deps.onEncoded?.(rendition.name, video.durationMs / encodeMs);
    const realtime = video.durationMs
      ? ` (${(video.durationMs / encodeMs).toFixed(1)}× realtime)`
      : '';
    await videos.addEvent(
      videoId,
      'transcode',
      `${rendition.name} encoded in ${(encodeMs / 1000).toFixed(1)}s, ${mb(size)}${realtime}`,
    );
    await job?.updateProgress(100);
    return {renditionId, name: rendition.name, mp4Key, sizeBytes: size, encodeMs};
  } catch (err) {
    await reporting.catch(() => undefined);
    if (controller.signal.aborted) {
      await videos.updateRendition(renditionId, {status: 'failed'});
      throw new UnrecoverableError('Video was canceled during encoding');
    }
    // Bad input data won't get better on retry.
    if (
      err instanceof FfmpegError &&
      /Invalid data found|could not find codec/i.test(err.stderrTail)
    ) {
      throw new UnrecoverableError(err.message);
    }
    throw err;
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
}

/**
 * Removes temp folders left by a crashed process (SIGKILL, OOM). Run at
 * startup, before taking jobs, and only for folders older than `olderThanMs`
 * in case another worker shares the directory.
 */
export async function sweepTempDirs(tmpDir: string, olderThanMs = 6 * 3600_000): Promise<number> {
  let removed = 0;
  const entries = await readdir(tmpDir, {withFileTypes: true}).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(TMP_PREFIX)) continue;
    const path = join(tmpDir, entry.name);
    const {mtimeMs} = await stat(path);
    if (Date.now() - mtimeMs > olderThanMs) {
      await rm(path, {recursive: true, force: true});
      removed++;
    }
  }
  return removed;
}
