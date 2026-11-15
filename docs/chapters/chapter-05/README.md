# Chapter 5: Queue architecture and BullMQ Flows

**Goal:** the backbone every worker plugs into: one queue per stage, typed job
contracts, a Flow per video so packaging waits for every rendition, and job IDs
that make every enqueue idempotent.

## What you get

- `packages/queues`:
  - `QUEUES`: `probe`, `transcode`, `package`, `thumbnail`, `notify`
  - `jobSchemas` (zod) and `JobResults`: what each job takes and returns
  - `jobIds`: deterministic IDs like `transcode-{videoId}-720p`
  - `priorityFor(durationMs)`: short videos first
  - `Pipeline`: `enqueueProbe`, `startProcessing` (the Flow), `enqueueNotify`, `counts`, `isAvailable`
  - `createWorker(queue, processor)`: validates data, logs lifecycle, typed results
  - `shutdownOnSignal`: finish active jobs on SIGTERM
- API enqueues `probe` when an upload completes; `/health` checks Redis
- `pnpm queues:stats [--watch]`: live job counts per queue
- Redis in CI

[IMPLEMENTATION](IMPLEMENTATION.md) · [ARCHITECTURE](ARCHITECTURE.md) ·
[TESTING](TESTING.md) · [PR_REVIEW](PR_REVIEW.md) · [REBUILD_PROMPT](REBUILD_PROMPT.md)

**Next:** Chapter 6, the probe service.
