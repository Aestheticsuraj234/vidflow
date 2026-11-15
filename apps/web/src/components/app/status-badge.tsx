import type {VideoStatusName} from '@vidflow/shared';

import {cn} from '@/lib/cn';

const STYLE: Record<VideoStatusName, string> = {
  created: 'text-muted',
  uploading: 'text-warning',
  uploaded: 'text-fg',
  probing: 'text-warning',
  processing: 'text-warning',
  ready: 'text-accent',
  failed: 'text-danger',
  canceled: 'text-muted',
};

export function StatusBadge({status}: {status: VideoStatusName}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs',
        STYLE[status],
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {status}
    </span>
  );
}
