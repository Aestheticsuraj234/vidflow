'use client';

import type {VideoSummary} from '@vidflow/shared';
import {Film, UploadCloud} from 'lucide-react';
import Link from 'next/link';
import {useCallback, useEffect, useState} from 'react';

import {AppHeader} from '@/components/app/app-header';
import {StatusBadge} from '@/components/app/status-badge';
import {Button} from '@/components/ui/button';
import {api} from '@/lib/api';
import {formatDuration} from '@/lib/format';
import {useLiveVideos} from '@/lib/use-live-videos';

export default function LibraryPage() {
  const [videos, setVideos] = useState<VideoSummary[] | null>(null);

  const load = useCallback(async () => {
    const res = await api<{videos: VideoSummary[]}>('/v1/videos');
    setVideos(res.videos);
  }, []);

  useEffect(() => {
    void load().catch(() => setVideos([]));
  }, [load]);

  useLiveVideos((m) => {
    setVideos(
      (list) =>
        list?.map((v) =>
          v.id === m.videoId
            ? {...v, status: m.status as VideoSummary['status'], progress: m.progress}
            : v,
        ) ?? list,
    );
    // Poster and playback URL arrive with "ready" and thumbnail events.
    if ((m.status === 'ready' && !m.event) || m.event?.stage === 'thumbnail') void load();
  });

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Library</h1>
            <p className="mt-1 text-muted">{videos ? `${videos.length} videos` : 'Loading…'}</p>
          </div>
          <Link href="/upload">
            <Button>
              <UploadCloud className="size-4" /> Upload
            </Button>
          </Link>
        </div>

        {videos?.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border py-20 text-center">
            <Film className="size-7 text-muted" aria-hidden />
            <p className="text-muted">No videos yet. Upload one to see it here.</p>
          </div>
        )}

        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {videos?.map((v) => (
            <li key={v.id}>
              <Link
                href={`/videos/${v.id}`}
                className="group flex flex-col gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-accent"
              >
                <div className="relative aspect-video overflow-hidden rounded-md border border-border bg-surface-2">
                  {v.posterUrl ? (
                    // Posters are plain public JPEGs on the bucket/CDN.
                    <img
                      src={v.posterUrl}
                      alt=""
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="grid size-full place-items-center">
                      <Film className="size-6 text-muted" aria-hidden />
                    </div>
                  )}
                  {v.durationMs !== null && (
                    <span className="absolute right-2 bottom-2 rounded-sm bg-black/75 px-1.5 py-0.5 font-mono text-xs text-white">
                      {formatDuration(v.durationMs / 1000)}
                    </span>
                  )}
                  {(v.status === 'probing' || v.status === 'processing') && (
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
                      <div
                        className="h-full bg-accent transition-[width] duration-500"
                        style={{width: `${v.progress}%`}}
                      />
                    </div>
                  )}
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium group-hover:text-accent">{v.title}</p>
                    <p className="font-mono text-xs text-muted">
                      {v.width && v.height ? `${v.width}×${v.height} · ` : ''}
                      {new Date(v.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <StatusBadge status={v.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
