# Chapter 12: Implementation

## Failure taxonomy

| Failure                                | Handling                                                  |
| -------------------------------------- | --------------------------------------------------------- |
| Transient (network, 5xx, storage blip) | Retry with exponential backoff (3 attempts; webhooks 8)   |
| Bad input (not a video, too long)      | `UnrecoverableError`: fail now, no retries                |
| Worker died (OOM, SIGKILL, node lost)  | Lock expires → job is _stalled_ → another worker takes it |
| Job keeps killing its worker           | `maxStalledCount: 2`, then failed                         |
| Failed for good                        | Video failed + `video.failed` webhook + copy in `dead`    |

1. **Dead letters.** `onFinalFailure(worker, handler, log, pipeline)` also calls
   `pipeline.deadLetter()`: a job in the `dead` queue holding the original queue,
   ID, data, error and attempts (ID `dead-{queue}-{jobId}`, so once per job). No
   worker consumes it; Bull Board shows it. `replay(id)` retries the original if
   BullMQ still has it in `failed`, otherwise adds a fresh copy, then removes
   the letter.
2. **Stalls.** BullMQ workers hold a lock per active job and renew it. A dead
   process stops renewing; after `lockDuration` the job is moved back to wait
   by the stalled-job checker. `TRANSCODE_LOCK_MS` sets both (default 60 s for
   long CPU-bound encodes; the chaos test uses 3 s).
3. **Cancel** (`cancelVideo` service): abort the multipart upload if uploading,
   move to `canceled` (a conditional update, so racing workers see it), remove
   probe/thumbnail/transcode/package jobs that aren't running
   (`Pipeline.cancelVideo`; the parent with `removeChildren`), delete all stored
   files, log the counts. Running encodes check the status every progress tick
   and kill FFmpeg (Chapter 7); the package and thumbnail workers refuse
   canceled videos.
4. **Delete** = cancel if needed, `deletePrefix` on `sources/`, `work/` and
   `public/videos/{id}/`, then delete the row (renditions, assets and events
   cascade; webhook deliveries keep their log with `video_id` null).
5. **Rate limits.** `RateLimiter.hit(key, limit, window)`: `INCR` + `EXPIRE` in a
   `MULTI`, keyed by user and window number. Uploads per hour, plus a count of
   the user's videos in `uploaded`/`probing`/`processing`. `UploadService` runs
   both through a `beforeCreate` hook; `TooManyRequestsError` sets `Retry-After`.
6. **Maintenance.** The notify worker (light, always running) also consumes a
   `maintenance` queue. `upsertJobScheduler('stale-uploads', {every: 15 min})`
   keeps exactly one schedule however many replicas start. The task aborts
   multipart uploads older than 24 h and cancels their videos.
7. **Chaos test** (`tests/chaos`): starts probe, package, thumbnail and two
   transcode workers as real processes (`tsx`, own process groups, test queue
   prefix, 3 s locks, `medium` preset so encodes take a while), waits until both
   transcode workers are busy, `SIGKILL`s one (FFmpeg included), and asserts the
   video becomes `ready`, every rendition is packaged, the survivor is alive and
   at least one transcode job has `stalledCounter > 0`.
