import type {Video} from '@vidflow/db';
import type {VideoSummary} from '@vidflow/shared';

export function toVideoSummary(v: Video): VideoSummary {
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
  };
}
