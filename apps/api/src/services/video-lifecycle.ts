import type {Video, VideoRepository} from '@vidflow/db';
import type {Pipeline} from '@vidflow/queues';
import {keys, type StorageProvider} from '@vidflow/storage';

export interface LifecycleDeps {
  videos: VideoRepository;
  storage: StorageProvider;
  pipeline: Pipeline;
}

const IN_FLIGHT = ['created', 'uploading', 'uploaded', 'probing', 'processing'];

/**
 * Stops a video wherever it is: aborts the upload, removes queued jobs (a
 * running encode notices within one progress tick and kills FFmpeg), and
 * deletes everything stored for it.
 */
export async function cancelVideo(deps: LifecycleDeps, video: Video): Promise<Video | undefined> {
  if (!IN_FLIGHT.includes(video.status)) return undefined;
  if (video.status === 'uploading' && video.sourceKey && video.uploadId) {
    await deps.storage.abortMultipartUpload(video.sourceKey, video.uploadId).catch(() => undefined);
  }
  const canceled = await deps.videos.transition(video.id, 'canceled', {uploadId: null});
  if (!canceled) return undefined;
  const renditions = await deps.videos.listRenditions(video.id);
  const removed = await deps.pipeline.cancelVideo(
    video.id,
    renditions.map((r) => r.name),
  );
  const files = await deleteFiles(deps.storage, video.id);
  await deps.videos.addEvent(
    video.id,
    'cancel',
    `Canceled: ${removed} queued jobs removed, ${files} files deleted`,
  );
  return canceled;
}

/** Deletes every stored object of a video. Returns how many. */
export async function deleteFiles(storage: StorageProvider, videoId: string): Promise<number> {
  const counts = await Promise.all(keys.allPrefixes(videoId).map((p) => storage.deletePrefix(p)));
  return counts.reduce((a, b) => a + b, 0);
}

/** Cancels if needed, deletes the files, then the rows (cascade). */
export async function deleteVideo(deps: LifecycleDeps, video: Video): Promise<void> {
  await cancelVideo(deps, video);
  await deleteFiles(deps.storage, video.id);
  await deps.videos.delete(video.id);
}
