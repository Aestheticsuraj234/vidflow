'use client';

import {ACCEPTED_VIDEO_TYPES, type VideoSummary} from '@vidflow/shared';
import {CheckCircle2, FileVideo, Pause, Play, UploadCloud, X} from 'lucide-react';
import {useCallback, useEffect, useRef, useState} from 'react';

import {AppHeader} from '@/components/app/app-header';
import {StatusBadge} from '@/components/app/status-badge';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {api} from '@/lib/api';
import {cn} from '@/lib/cn';
import {formatBytes, formatDuration} from '@/lib/format';
import {browserIO} from '@/lib/upload/browser-io';
import {fingerprint, uploadFile, type UploadProgress} from '@/lib/upload/uploader';

type Phase = 'idle' | 'uploading' | 'paused' | 'done' | 'error';

const ACCEPT = Object.keys(ACCEPTED_VIDEO_TYPES).join(',');

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [recent, setRecent] = useState<VideoSummary[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const sample = useRef<{t: number; bytes: number} | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadRecent = useCallback(async () => {
    try {
      const {videos} = await api<{videos: VideoSummary[]}>('/v1/videos');
      setRecent(videos.slice(0, 8));
    } catch {
      // Header handles a lost session.
    }
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  function pick(next: File | undefined) {
    if (!next) return;
    if (!(next.type in ACCEPTED_VIDEO_TYPES)) {
      setError(
        `${next.name} isn't a supported video (${Object.values(ACCEPTED_VIDEO_TYPES).join(', ')})`,
      );
      return;
    }
    setFile(next);
    setTitle(next.name.replace(/\.[^.]+$/, ''));
    setPhase('idle');
    setProgress(null);
    setError(null);
  }

  async function start() {
    if (!file) return;
    const controller = new AbortController();
    abortRef.current = controller;
    sample.current = null;
    setPhase('uploading');
    setError(null);
    try {
      await uploadFile(file, browserIO, {
        title: title.trim() || file.name,
        signal: controller.signal,
        onProgress: (p) => {
          setProgress(p);
          const now = performance.now();
          const prev = sample.current;
          if (!prev) sample.current = {t: now, bytes: p.sentBytes};
          else if (now - prev.t > 1000) {
            setRate(((p.sentBytes - prev.bytes) / (now - prev.t)) * 1000);
            sample.current = {t: now, bytes: p.sentBytes};
          }
        },
      });
      setPhase('done');
      void loadRecent();
    } catch (err) {
      if (controller.signal.aborted) {
        setPhase('paused');
      } else {
        setPhase('error');
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    }
  }

  function pause() {
    abortRef.current?.abort();
  }

  async function cancel() {
    abortRef.current?.abort();
    if (file && progress) {
      await api(`/v1/videos/${progress.videoId}/upload`, {method: 'DELETE'}).catch(() => null);
      browserIO.store.removeItem(fingerprint(file));
    }
    setFile(null);
    setProgress(null);
    setPhase('idle');
    void loadRecent();
  }

  const pct = progress ? Math.round((progress.sentBytes / progress.totalBytes) * 100) : 0;
  const eta = progress && rate > 0 ? (progress.totalBytes - progress.sentBytes) / rate : NaN;
  const busy = phase === 'uploading';

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold">Upload a video</h1>
          <p className="mt-1 text-muted">
            Files go straight to storage in parts. Close the tab mid-upload and pick the same file
            again to resume.
          </p>
        </div>

        {!file ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files[0]);
            }}
            className={cn(
              'flex flex-col items-center gap-3 rounded-md border border-dashed border-border bg-surface px-6 py-16 text-center transition-colors hover:border-accent/60',
              dragging && 'border-accent bg-accent/5',
            )}
          >
            <UploadCloud className="size-8 text-accent" aria-hidden />
            <span className="font-medium">Drop a video here, or click to choose</span>
            <span className="text-sm text-muted">MP4, MOV, WebM, MKV, AVI or MPEG</span>
          </button>
        ) : (
          <Card className="flex flex-col gap-5">
            <div className="flex items-start gap-3">
              <FileVideo className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{file.name}</p>
                <p className="text-sm text-muted">
                  {formatBytes(file.size)} · {file.type}
                </p>
              </div>
              {!busy && phase !== 'done' && (
                <Button variant="ghost" size="sm" onClick={cancel} aria-label="Remove file">
                  <X className="size-4" />
                </Button>
              )}
            </div>

            {phase === 'idle' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
            )}

            {progress && (
              <div className="flex flex-col gap-2">
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={cn(
                      'h-full bg-accent transition-[width]',
                      phase === 'paused' && 'bg-muted',
                    )}
                    style={{width: `${pct}%`}}
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
                <div className="flex justify-between font-mono text-xs text-muted">
                  <span>
                    {pct}% · {formatBytes(progress.sentBytes)} of {formatBytes(progress.totalBytes)}{' '}
                    · part {progress.partsDone}/{progress.partCount}
                    {progress.resumed && ' · resumed'}
                  </span>
                  {busy && (
                    <span>
                      {formatBytes(rate)}/s · {formatDuration(eta)} left
                    </span>
                  )}
                </div>
              </div>
            )}

            {error && <p className="text-sm text-danger">{error}</p>}

            {phase === 'done' ? (
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="size-4 text-accent" aria-hidden /> Uploaded. Processing
                  starts automatically.
                </p>
                <Button variant="secondary" size="sm" onClick={() => setFile(null)}>
                  Upload another
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                {busy ? (
                  <Button variant="secondary" onClick={pause}>
                    <Pause className="size-4" /> Pause
                  </Button>
                ) : (
                  <Button onClick={start}>
                    {phase === 'idle' ? (
                      <>
                        <UploadCloud className="size-4" /> Start upload
                      </>
                    ) : (
                      <>
                        <Play className="size-4" /> Resume
                      </>
                    )}
                  </Button>
                )}
                {progress && (
                  <Button variant="ghost" onClick={cancel}>
                    Cancel upload
                  </Button>
                )}
              </div>
            )}
          </Card>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        {error && !file && <p className="text-sm text-danger">{error}</p>}

        {recent.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted">Recent uploads</h2>
            <ul className="divide-y divide-border rounded-md border border-border bg-surface">
              {recent.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{v.title}</p>
                    <p className="font-mono text-xs text-muted">
                      {v.sourceSizeBytes ? formatBytes(v.sourceSizeBytes) : '—'} ·{' '}
                      {new Date(v.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <StatusBadge status={v.status} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
