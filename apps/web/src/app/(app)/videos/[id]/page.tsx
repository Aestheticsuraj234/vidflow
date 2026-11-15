'use client';

import type {VideoDetail} from '@vidflow/shared';
import {Check, Copy, Loader2} from 'lucide-react';
import {useParams} from 'next/navigation';
import {useCallback, useEffect, useState} from 'react';

import {AppHeader} from '@/components/app/app-header';
import {StatusBadge} from '@/components/app/status-badge';
import {VideoPlayer} from '@/components/player/video-player';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {api, ApiError} from '@/lib/api';
import {cn} from '@/lib/cn';
import {formatBytes, formatDuration} from '@/lib/format';
import {useLiveVideos} from '@/lib/use-live-videos';

const STAGES = ['upload', 'queue', 'probe', 'transcode', 'thumbnail', 'package', 'ready', 'failed'];

export default function VideoPage() {
  const {id} = useParams<{id: string}>();
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setVideo(await api<VideoDetail>(`/v1/videos/${id}`));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setMissing(true);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveVideos((m) => {
    if (m.videoId !== id) return;
    setVideo(
      (v) =>
        v && {
          ...v,
          status: m.status as VideoDetail['status'],
          progress: m.progress,
          error: m.error,
          events: m.event ? [...v.events, {...m.event, createdAt: m.at}] : v.events,
        },
    );
    // Renditions, poster and playback URL: refetch on milestones.
    if (m.event || m.status === 'ready') void load();
  });

  if (missing) {
    return (
      <div className="min-h-dvh">
        <AppHeader />
        <p className="px-6 py-20 text-center text-muted">Video not found.</p>
      </div>
    );
  }
  if (!video) {
    return (
      <div className="min-h-dvh">
        <AppHeader />
        <Loader2 className="mx-auto mt-20 size-6 animate-spin text-muted" />
      </div>
    );
  }

  const busy = !['ready', 'failed', 'canceled'].includes(video.status);
  const facts = [
    ['Resolution', video.width && video.height ? `${video.width}×${video.height}` : '—'],
    ['Duration', video.durationMs ? formatDuration(video.durationMs / 1000) : '—'],
    ['Frame rate', video.fps ? `${video.fps} fps` : '—'],
    ['Codec', video.videoCodec ?? '—'],
    ['Audio', video.hasAudio === null ? '—' : video.hasAudio ? 'yes' : 'none'],
    ['Source', video.sourceSizeBytes ? formatBytes(video.sourceSizeBytes) : '—'],
  ];

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto grid max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          {video.status === 'ready' && video.playbackUrl ? (
            <VideoPlayer
              src={video.playbackUrl}
              poster={video.posterUrl}
              previews={video.previewsUrl}
            />
          ) : (
            <div className="relative grid aspect-video place-items-center overflow-hidden rounded-md border border-border bg-surface">
              {video.posterUrl && (
                <img
                  src={video.posterUrl}
                  alt=""
                  className="absolute inset-0 size-full object-cover opacity-30"
                />
              )}
              <div className="relative flex w-64 flex-col items-center gap-3 text-center">
                {busy && <Loader2 className="size-6 animate-spin text-accent" />}
                <p className="font-medium">
                  {video.status === 'failed'
                    ? 'Processing failed'
                    : video.status === 'canceled'
                      ? 'Canceled'
                      : `Processing · ${video.progress}%`}
                </p>
                {busy && (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full bg-accent transition-[width] duration-500"
                      style={{width: `${video.progress}%`}}
                    />
                  </div>
                )}
                {video.error && <p className="text-sm text-danger">{video.error}</p>}
              </div>
            </div>
          )}

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold">{video.title}</h1>
              <p className="text-sm text-muted">
                Uploaded {new Date(video.createdAt).toLocaleString()}
              </p>
            </div>
            <StatusBadge status={video.status} />
          </div>

          {video.playbackUrl && (
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-sm border border-border bg-surface px-3 py-2 font-mono text-xs text-muted">
                {video.playbackUrl}
              </code>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(video.playbackUrl ?? '');
                  setCopied(true);
                }}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />} HLS URL
              </Button>
            </div>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted">Renditions</h2>
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface font-mono text-xs text-muted">
                  <tr>
                    {['name', 'size', 'bitrate', 'status', 'file', 'encode'].map((h) => (
                      <th key={h} className="px-4 py-2 font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono text-xs">
                  {video.renditions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-3 text-muted">
                        Chosen after probing.
                      </td>
                    </tr>
                  )}
                  {video.renditions.map((r) => (
                    <tr key={r.name}>
                      <td className="px-4 py-2 text-fg">{r.name}</td>
                      <td className="px-4 py-2">
                        {r.width}×{r.height}
                      </td>
                      <td className="px-4 py-2">{(r.videoBitrateKbps / 1000).toFixed(1)} Mb/s</td>
                      <td className="px-4 py-2">
                        {r.status === 'transcoding' ? `${r.status} ${r.progress}%` : r.status}
                      </td>
                      <td className="px-4 py-2">{r.sizeBytes ? formatBytes(r.sizeBytes) : '—'}</td>
                      <td className="px-4 py-2">
                        {r.encodeMs ? `${(r.encodeMs / 1000).toFixed(1)}s` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <Card className="p-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="font-mono text-xs">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <section className="flex flex-col gap-3" aria-label="Timeline">
            <h2 className="text-sm font-medium text-muted">Timeline</h2>
            <ol className="relative flex flex-col gap-4 border-l border-border pl-5">
              {video.events.map((e, i) => (
                <li key={`${e.createdAt}-${i}`} className="relative">
                  <span
                    className={cn(
                      'absolute top-1.5 -left-[23.5px] size-2 rounded-full',
                      e.stage === 'failed'
                        ? 'bg-danger'
                        : e.stage === 'ready'
                          ? 'bg-accent'
                          : 'bg-muted',
                    )}
                  />
                  <p className="text-sm">{e.message}</p>
                  <p className="font-mono text-xs text-muted">
                    {STAGES.includes(e.stage) ? e.stage : 'event'} ·{' '}
                    {new Date(e.createdAt).toLocaleTimeString()}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </main>
    </div>
  );
}
