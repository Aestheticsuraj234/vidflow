# Chapter 5: Rebuild prompt

Add `packages/queues` on BullMQ 6: queues `probe`, `transcode`, `package`,
`thumbnail`, `notify`; zod data schemas and result types per queue;
deterministic `-`-separated job IDs; `priorityFor(durationMs)`; a
`redisConnection(url)` with `maxRetriesPerRequest: null`; a `Pipeline` class
with typed queues, default retries/backoff/retention, `enqueueProbe`,
`startProcessing` (FlowProducer: `package` parent with `transcode` children using
`failParentOnFailure`, plus a separate thumbnail job), `enqueueNotify`,
`counts`, `isAvailable` (1 s timeout) and error listeners; `createWorker` that
validates data and throws `UnrecoverableError` on bad data; and
`shutdownOnSignal`. Enqueue probe from the API when an upload completes, check
Redis in `/health`, add `pnpm queues:stats`, and test against real Redis.
