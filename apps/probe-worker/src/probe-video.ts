import type {Video, VideoRepository} from '@vidflow/db';
import {gopFrames, planRenditions, probe, ProbeError, type MediaInfo} from '@vidflow/media';
import {UnrecoverableError, type JobData, type Pipeline, type ProbeResult} from '@vidflow/queues';
import type {StorageProvider} from '@vidflow/storage';

export interface ProbeDeps {
  videos: VideoRepository;
  storage: StorageProvider;
  pipeline: Pipeline;
  maxDurationMs: number;
  /** Called once when the video starts processing (sends `video.processing`). */
  onProcessing?: (video: Video) => Promise<void>;
  /** Swappable for tests. */
  probe?: (input: string) => Promise<MediaInfo>;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

/**
 * Probe stage: read the source with ffprobe, reject what we can't process,
 * pick the rendition ladder and start the transcode flow.
 *
 * Safe to run more than once for the same video: a retry after a crash picks
 * up from whatever state the video reached.
 */
export async function probeVideo(
  deps: ProbeDeps,
  {videoId}: JobData<'probe'>,
): Promise<ProbeResult> {
  const {videos, storage, pipeline} = deps;
  const video = await videos.findById(videoId);
  if (!video) throw new UnrecoverableError(`Video ${videoId} not found`);
  if (!video.sourceKey) throw new UnrecoverableError(`Video ${videoId} has no source`);

  if (video.status === 'uploaded') {
    await videos.transition(videoId, 'probing', {progress: 1});
    await videos.addEvent(videoId, 'probe', 'Probing source');
  } else if (video.status !== 'probing' && video.status !== 'processing') {
    // Canceled, failed or already done: nothing to do.
    return {durationMs: video.durationMs ?? 0, renditions: []};
  }

  // ffprobe reads the presigned URL directly: no download, and it only
  // fetches the bytes it needs (the moov atom and a few packets).
  const url = await storage.presignGet(video.sourceKey, 15 * 60);
  let info: MediaInfo;
  try {
    info = await (deps.probe ?? probe)(url);
  } catch (err) {
    if (err instanceof ProbeError && err.invalidMedia) throw new UnrecoverableError(err.message);
    throw err;
  }
  if (info.durationMs > deps.maxDurationMs) {
    throw new UnrecoverableError(
      `Video is ${seconds(info.durationMs)} long; the limit is ${seconds(deps.maxDurationMs)}`,
    );
  }
  if (Math.min(info.width, info.height) < 64) {
    throw new UnrecoverableError(`Video is too small (${info.width}×${info.height})`);
  }

  const plan = planRenditions(info);
  const gop = gopFrames(info.fps);
  await videos.update(videoId, {
    durationMs: info.durationMs,
    width: info.width,
    height: info.height,
    fps: info.fps,
    videoCodec: info.videoCodec,
    audioCodec: info.audioCodec,
    hasAudio: info.hasAudio,
  });
  // Unique (video, name) makes this a no-op on retry; read back for the IDs.
  await videos.createRenditions(plan.map((r) => ({videoId, ...r})));
  const rows = (await videos.listRenditions(videoId)).filter((r) =>
    plan.some((p) => p.name === r.name),
  );

  if (video.status !== 'processing') {
    const moved = await videos.transition(videoId, 'processing', {progress: 5});
    if (!moved) return {durationMs: info.durationMs, renditions: []}; // canceled meanwhile
    await deps.onProcessing?.(moved);
    await videos.addEvent(
      videoId,
      'probe',
      `${info.width}×${info.height} ${info.videoCodec} ${info.fps}fps, ${seconds(info.durationMs)}` +
        `${info.hasAudio ? '' : ', no audio'} → ${plan.map((r) => r.name).join(', ')}`,
    );
  }

  // Idempotent: same job IDs, so a retry can't create a second flow.
  await pipeline.startProcessing({
    videoId,
    durationMs: info.durationMs,
    gopFrames: gop,
    renditions: rows.map((r) => ({
      id: r.id,
      name: r.name,
      width: r.width,
      height: r.height,
      videoBitrateKbps: r.videoBitrateKbps,
      audioBitrateKbps: r.audioBitrateKbps,
    })),
  });
  return {durationMs: info.durationMs, renditions: rows.map((r) => r.name)};
}
