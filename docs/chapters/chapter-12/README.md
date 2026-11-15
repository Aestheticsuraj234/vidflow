# Chapter 12: Reliability: retries, cancellation, cleanup

**Goal:** the pipeline keeps its promises when things go wrong: workers die
mid-encode, users cancel or delete, someone uploads 500 files, uploads get
abandoned, and jobs fail for good.

## What you get

- **Dead-letter queue**: every job that fails for good is copied to `dead` with
  its error; `pnpm queues:replay [id|--all]` retries it
- **Stalled jobs**: configurable lock (`TRANSCODE_LOCK_MS`), `maxStalledCount: 2`
- **Cancel**: `POST /v1/videos/:id/cancel` aborts the upload, removes queued
  flow jobs, stops a running encode, deletes files
- **Delete**: `DELETE /v1/videos/:id` cancels, deletes every stored object, then the rows
- **Rate limits**: `UPLOADS_PER_HOUR` (Redis window, shared by all API replicas)
  and `MAX_ACTIVE_VIDEOS` per user → `429` with `Retry-After`
- **Maintenance**: a BullMQ job scheduler cancels uploads abandoned for 24 h
- **Chaos test**: real worker processes, one SIGKILLed mid-encode; the video
  still goes ready (the killed job recovered by stall detection in ~50 s)
- Cancel and Delete buttons on the video page

[IMPLEMENTATION](IMPLEMENTATION.md) · [ARCHITECTURE](ARCHITECTURE.md) ·
[TESTING](TESTING.md) · [PR_REVIEW](PR_REVIEW.md) · [REBUILD_PROMPT](REBUILD_PROMPT.md)

**Next:** Chapter 13, observability.
