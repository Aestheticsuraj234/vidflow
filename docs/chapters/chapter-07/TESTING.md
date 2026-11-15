# Chapter 7: Testing

```bash
pnpm --filter @vidflow/media test            # runFfmpeg + h264Args
pnpm --filter @vidflow/transcode-worker test # + Postgres, RustFS
```

- `packages/media/test/ffmpeg.test.ts` (9): progress parsing; a real 360p encode
  with keyframes at exactly 0 s and 2 s; silent rendition has no audio; rotated
  phone video comes out 360×640 upright; stderr reason on bad input; abort; timeout;
  missing binary
- `apps/transcode-worker/test/transcode-rendition.test.ts` (6): encode, upload,
  rendition row, video progress 85, stored file probes as 640×360 H.264, event
  text, temp dir empty; retry reuses the finished MP4; canceled video refused;
  cancel during the encode kills FFmpeg and marks the rendition failed; failed
  encode cleans up; startup sweep removes only old leftovers

## In Docker

```bash
docker build -f docker/Dockerfile --target transcode-worker -t vidflow-transcode-worker .
docker run --rm --network host --env-file .env vidflow-transcode-worker
```

The container (FFmpeg 5.1 from Debian 12) encoded a browser upload while the
local worker was stopped. Stopping it mid-job left a stalled job that the local
worker finished.
