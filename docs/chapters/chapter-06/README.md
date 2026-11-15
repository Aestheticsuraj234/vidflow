# Chapter 6: Probe service

**Goal:** the first worker. Read the uploaded file with ffprobe, reject what
can't be processed, choose a rendition ladder that never upscales, and start
the transcode flow.

## What you get

- `packages/media`: `probe()` (ffprobe → `MediaInfo`, rotation-aware), `ProbeError`
  that knows bad files from transient failures, `planRenditions()` and `gopFrames()`
- `apps/probe-worker`: the `probe` queue consumer
- `VideoRepository.fail()`, `onFinalFailure()` in `@vidflow/queues`
- `packages/test-utils`: real Postgres/RustFS/Redis test context and generated video fixtures
- FFmpeg in CI

Live: a 20 s 1280×720 upload is probed in about 200 ms straight from a presigned
URL, and four transcode jobs wait under one package parent.

[IMPLEMENTATION](IMPLEMENTATION.md) · [ARCHITECTURE](ARCHITECTURE.md) ·
[TESTING](TESTING.md) · [PR_REVIEW](PR_REVIEW.md) · [REBUILD_PROMPT](REBUILD_PROMPT.md)

**Next:** Chapter 7, the transcode service.
