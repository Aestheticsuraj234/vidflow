import type {VideoStatus} from './schema';

export const FINAL_VIDEO_STATUSES = [
  'ready',
  'failed',
  'canceled',
] as const satisfies readonly VideoStatus[];

const NEXT: Record<VideoStatus, readonly VideoStatus[]> = {
  created: ['uploading', 'uploaded', 'canceled', 'failed'],
  uploading: ['uploaded', 'canceled', 'failed'],
  uploaded: ['probing', 'canceled', 'failed'],
  probing: ['processing', 'failed', 'canceled'],
  processing: ['ready', 'failed', 'canceled'],
  ready: [],
  failed: [],
  canceled: [],
};

export function isFinalVideoStatus(status: VideoStatus): boolean {
  return NEXT[status].length === 0;
}

/** Whether `from → to` is a legal step in the video lifecycle. */
export function canTransitionVideo(from: VideoStatus, to: VideoStatus): boolean {
  return NEXT[from].includes(to);
}

/** Statuses a video may be in for a move to `to` to be legal. */
export function allowedFrom(to: VideoStatus): VideoStatus[] {
  return (Object.keys(NEXT) as VideoStatus[]).filter((from) => NEXT[from].includes(to));
}
