import type {Video} from '@vidflow/db';
import type {VideoSummary} from '@vidflow/shared';
import {keys, type StorageProvider} from '@vidflow/storage';

export function toVideoSummary(v: Video, storage: StorageProvider): VideoSummary {
  return {
    id: v.id,
    title: v.title,
    status: v.status,
    progress: v.progress,
    error: v.error,
    sourceSizeBytes: v.sourceSizeBytes,
    durationMs: v.durationMs,
    width: v.width,
    height: v.height,
    createdAt: v.createdAt.toISOString(),
    readyAt: v.readyAt?.toISOString() ?? null,
    playbackUrl: v.status === 'ready' ? storage.publicUrl(keys.master(v.id)) : null,
  };
}
