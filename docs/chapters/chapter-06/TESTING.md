# Chapter 6: Testing

```bash
pnpm --filter @vidflow/media test         # ffprobe + ladder (needs ffmpeg)
pnpm --filter @vidflow/probe-worker test  # + Postgres, RustFS, Redis
```

Fixtures are generated with FFmpeg's test sources on first use and cached in
`/tmp/vidflow-fixtures`: 720p with audio, 1080×1920 portrait, a landscape file
with 90° rotation metadata, 320×180 without audio, audio-only M4A, and a text
file named `.mp4`.

- `packages/media/test/probe.test.ts` (15): dimensions, rotation, audio
  detection, invalid media vs. retryable errors, frame-rate parsing, ladder
  rules (no upscaling, 4K cap, portrait, even sizes, tiny input, silent,
  bitrate cap, 60 fps), GOP
- `apps/probe-worker/test/probe-video.test.ts` (6): full probe with renditions,
  Flow state and timeline; running twice; rotated phone video; not-a-video;
  too long; canceled video skipped
- `apps/probe-worker/test/worker.test.ts`: an audio-only upload through a real
  worker ends with the video `failed` and a readable reason

Live: upload in the browser, then `pnpm queues:stats` shows 4 transcode jobs
prioritized and 1 package job in `waiting-children`.
