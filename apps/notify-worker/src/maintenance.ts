import type {VideoRepository} from '@vidflow/db';
import type {StorageProvider} from '@vidflow/storage';

export interface MaintenanceDeps {
  videos: VideoRepository;
  storage: StorageProvider;
  /** Uploads untouched for this long are abandoned. Default 24 h. */
  staleUploadMs?: number;
}

/**
 * Cancels uploads nobody finished: a closed laptop, a lost connection. The
 * bucket's lifecycle rule would drop the parts after a day anyway; this keeps
 * the database honest and frees the user's slot.
 */
export async function sweepStaleUploads(deps: MaintenanceDeps): Promise<number> {
  const before = new Date(Date.now() - (deps.staleUploadMs ?? 24 * 3600_000));
  const stale = await deps.videos.listStaleUploads(before);
  let changed = 0;
  for (const video of stale) {
    if (video.sourceKey && video.uploadId) {
      await deps.storage
        .abortMultipartUpload(video.sourceKey, video.uploadId)
        .catch(() => undefined);
    }
    const canceled = await deps.videos.transition(video.id, 'canceled', {
      uploadId: null,
      error: 'Upload was never completed',
    });
    if (canceled) {
      await deps.videos.addEvent(video.id, 'cleanup', 'Abandoned upload canceled');
      changed++;
    }
  }
  return changed;
}
