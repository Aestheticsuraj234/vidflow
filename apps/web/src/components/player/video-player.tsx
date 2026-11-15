'use client';

import type Hls from 'hls.js';
import {Maximize, Pause, Play, Settings, Volume2, VolumeX} from 'lucide-react';
import {useEffect, useRef, useState, type PointerEvent} from 'react';

import {cn} from '@/lib/cn';
import {cueAt, parsePreviewVtt, type PreviewCue} from '@/lib/vtt';

interface Level {
  index: number;
  height: number;
  bitrate: number;
}

export interface VideoPlayerProps {
  src: string;
  poster?: string | null;
  /** WebVTT index into the preview sprite. */
  previews?: string | null;
}

function clock(sec: number): string {
  if (!Number.isFinite(sec)) return '0:00';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/**
 * HLS player: hls.js where Media Source Extensions exist, native HLS on
 * Safari/iOS. Custom controls add a quality menu (Auto or a fixed rendition)
 * and sprite-sheet previews while hovering the timeline.
 */
export function VideoPlayer({src, poster, previews}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [levels, setLevels] = useState<Level[]>([]);
  const [selected, setSelected] = useState(-1); // -1 = Auto
  const [current, setCurrent] = useState(-1);
  const [menu, setMenu] = useState(false);
  const [cues, setCues] = useState<PreviewCue[]>([]);
  const [hover, setHover] = useState<{x: number; time: number} | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Attach the stream.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;

    (async () => {
      const {default: HlsLib} = await import('hls.js');
      if (cancelled) return;
      if (HlsLib.isSupported()) {
        const hls = new HlsLib({capLevelToPlayerSize: true, maxBufferLength: 30});
        hlsRef.current = hls;
        hls.on(HlsLib.Events.MANIFEST_PARSED, (_e, data) => {
          setLevels(
            data.levels
              .map((l, index) => ({index, height: l.height, bitrate: l.bitrate}))
              .sort((a, b) => b.height - a.height),
          );
        });
        hls.on(HlsLib.Events.LEVEL_SWITCHED, (_e, data) => setCurrent(data.level));
        hls.on(HlsLib.Events.ERROR, (_e, data) => {
          if (data.fatal) setError(`Playback error: ${data.details}`);
        });
        hls.loadSource(src);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src; // Safari plays HLS natively and picks quality itself.
      } else {
        setError('This browser cannot play HLS');
      }
    })();

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [src]);

  // Load scrub previews.
  useEffect(() => {
    if (!previews) return;
    let alive = true;
    fetch(previews)
      .then((r) => (r.ok ? r.text() : ''))
      .then((text) => alive && setCues(parsePreviewVtt(text, previews)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [previews]);

  function chooseLevel(index: number) {
    const hls = hlsRef.current;
    if (hls) {
      // -1 hands control back to hls.js's bandwidth estimator.
      hls.currentLevel = index;
      setSelected(index);
    }
    setMenu(false);
  }

  function timeAt(e: PointerEvent): {x: number; time: number} {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return {x: 0, time: 0};
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    return {x, time: (x / rect.width) * duration};
  }

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  };

  const preview = hover ? cueAt(cues, hover.time) : undefined;
  const activeHeight = levels.find((l) => l.index === current)?.height;

  return (
    <div
      ref={boxRef}
      className="group relative aspect-video w-full overflow-hidden rounded-md bg-black"
      data-testid="player"
    >
      <video
        ref={videoRef}
        poster={poster ?? undefined}
        playsInline
        className="size-full"
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          setTime(v.currentTime);
          if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
        }}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
      />

      {error && (
        <div className="absolute inset-0 grid place-items-center bg-black/70 text-sm text-danger">
          {error}
        </div>
      )}

      <div
        className={cn(
          'absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-black/80 to-transparent px-4 pt-10 pb-3 transition-opacity',
          playing && !menu && !hover ? 'opacity-0 group-hover:opacity-100' : 'opacity-100',
        )}
      >
        {/* Timeline with hover previews */}
        <div
          ref={barRef}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          tabIndex={0}
          className="relative h-4 cursor-pointer"
          onPointerMove={(e) => setHover(timeAt(e))}
          onPointerLeave={() => setHover(null)}
          onPointerDown={(e) => {
            const v = videoRef.current;
            if (v) v.currentTime = timeAt(e).time;
          }}
        >
          <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-white/20">
            <div
              className="absolute h-full rounded-full bg-white/30"
              style={{width: `${duration ? (buffered / duration) * 100 : 0}%`}}
            />
            <div
              className="absolute h-full rounded-full bg-accent"
              style={{width: `${duration ? (time / duration) * 100 : 0}%`}}
            />
          </div>
          {hover && (
            <div
              className="pointer-events-none absolute bottom-6 flex -translate-x-1/2 flex-col items-center gap-1"
              style={{
                left: Math.min(Math.max(hover.x, 80), (barRef.current?.clientWidth ?? 0) - 80),
              }}
              data-testid="scrub-preview"
            >
              {preview && (
                <div
                  className="rounded-sm border border-white/20 shadow-lg"
                  style={{
                    width: preview.w,
                    height: preview.h,
                    backgroundImage: `url(${preview.url})`,
                    backgroundPosition: `-${preview.x}px -${preview.y}px`,
                  }}
                />
              )}
              <span className="rounded-sm bg-black/80 px-1.5 py-0.5 font-mono text-xs text-white">
                {clock(hover.time)}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 text-white">
          <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
          </button>
          <button
            type="button"
            aria-label={muted ? 'Unmute' : 'Mute'}
            onClick={() => {
              const v = videoRef.current;
              if (v) v.muted = !v.muted;
            }}
          >
            {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          </button>
          <span className="font-mono text-xs">
            {clock(time)} / {clock(duration)}
          </span>
          <div className="relative ml-auto">
            {levels.length > 0 && (
              <button
                type="button"
                onClick={() => setMenu((m) => !m)}
                className="flex items-center gap-1.5 font-mono text-xs"
                aria-label="Quality"
                aria-expanded={menu}
              >
                <Settings className="size-4" />
                {selected === -1
                  ? `Auto${activeHeight ? ` (${activeHeight}p)` : ''}`
                  : `${activeHeight ?? ''}p`}
              </button>
            )}
            {menu && (
              <ul
                role="menu"
                className="absolute right-0 bottom-8 min-w-36 overflow-hidden rounded-sm border border-white/10 bg-black/90 py-1 font-mono text-xs"
              >
                {[{index: -1, height: 0, bitrate: 0}, ...levels].map((l) => (
                  <li key={l.index}>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected === l.index}
                      onClick={() => chooseLevel(l.index)}
                      className={cn(
                        'flex w-full justify-between gap-4 px-3 py-1.5 text-left hover:bg-white/10',
                        selected === l.index && 'text-accent',
                      )}
                    >
                      <span>{l.index === -1 ? 'Auto' : `${l.height}p`}</span>
                      {l.index !== -1 && (
                        <span className="text-white/50">{(l.bitrate / 1e6).toFixed(1)} Mb/s</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            aria-label="Fullscreen"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void boxRef.current?.requestFullscreen();
            }}
          >
            <Maximize className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
