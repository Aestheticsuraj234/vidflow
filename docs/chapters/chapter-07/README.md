# Chapter 7: Transcode service

**Goal:** the CPU-heavy stage. Encode each rendition to H.264/AAC with FFmpeg,
report live progress, stop when a video is canceled, never leak temp files,
and ship it as a container with FFmpeg inside.

## What you get

- `packages/media`: `runFfmpeg()` (spawn, `-progress` parsing, abort, timeout,
  stderr tail) and `h264Args()` (capped VBR, fixed GOP, auto-rotate, faststart)
- `apps/transcode-worker`: one rendition per job → `work/{id}/{name}.mp4`
- Progress per rendition and rolled up per video (5% → 85%)
- Cancel mid-encode kills FFmpeg within one progress tick
- Temp folder per job, always removed; stale folders swept at startup
- `docker/Dockerfile` with `api`, `probe-worker` and `transcode-worker` targets

Live: a 20 s 720p upload encodes 720p/480p/360p/240p at 4.0×–7.6× realtime
(7.0, 3.6, 2.2 and 1.1 MB).

[IMPLEMENTATION](IMPLEMENTATION.md) · [ARCHITECTURE](ARCHITECTURE.md) ·
[TESTING](TESTING.md) · [PR_REVIEW](PR_REVIEW.md) · [REBUILD_PROMPT](REBUILD_PROMPT.md)

**Next:** Chapter 8, HLS packaging.
