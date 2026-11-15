# Chapter 5: Implementation

1. **Contracts first.** `contracts.ts` defines every queue's data as a zod
   schema and every result as a type. Producers use `satisfies JobData<'x'>`;
   workers get parsed, typed data.
2. **Idempotent IDs.** BullMQ ignores `add()` when the job ID already exists.
   With `probe-{videoId}`, an API retry or a double click can't probe twice.
   BullMQ 6 rejects `:` in custom IDs, so IDs use `-`.
3. **The Flow.** `startProcessing(plan)` adds one `FlowProducer` tree:

   ```
   package-{id}                (parent, queue "package")
   ├── transcode-{id}-1080p    (child, queue "transcode")
   ├── transcode-{id}-720p
   └── transcode-{id}-360p
   ```

   The parent sits in `waiting-children` until every child completes, then
   reads their results with `job.getChildrenValues()`. Children use
   `failParentOnFailure`. `thumbnail-{id}` is added alongside, outside the tree,
   so a thumbnail failure never blocks playback.

4. **Child failure in BullMQ 6.** A child that exhausts its retries doesn't
   fail the parent on the spot: BullMQ records a deferred failure and moves the
   parent to waiting. The parent fails as soon as a `package` worker picks it
   up, and the processor never runs. Chapter 8 listens for that to fail the video.
5. **Defaults.** 3 attempts, exponential backoff from 5 s, completed jobs kept a
   day (max 1000), failed jobs a week. Notify jobs get 1 attempt; webhook
   retries are tracked per delivery in Chapter 10.
6. **Priorities.** `priorityFor` gives 1 to anything under 5 minutes and one step
   lower per 5 minutes after, capped at 21.
7. **Workers.** `createWorker` validates data and throws `UnrecoverableError`
   on bad data (retrying can't fix it), and logs start, completion with
   duration, and failure with the attempt number.
8. **Connections.** `redisConnection(url)` turns `REDIS_URL` into options with
   `maxRetriesPerRequest: null` (required by BullMQ workers), password decoding
   and TLS for `rediss://`. Queues get an `error` listener so a Redis outage is
   logged instead of crashing the process.
9. **Health.** `isAvailable()` races a real round trip against a 1 s timeout,
   because BullMQ connections retry forever and would hang the check.
10. **API.** `AppDeps` gains `pipeline`; a completed upload calls
    `enqueueProbe` and logs a "Queued for probing" event.
