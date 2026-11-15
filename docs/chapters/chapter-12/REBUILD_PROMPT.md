# Chapter 12: Rebuild prompt

Add `dead` and `maintenance` queues. `Pipeline.deadLetter(queue, job, err)`
(once per job), `replay(deadId)` (retry original if failed, else re-add), and
`cancelVideo(videoId, renditions)` (remove non-active probe/thumbnail/transcode
jobs and the package parent with children). `onFinalFailure` takes an optional
pipeline for dead letters; all workers pass it. Make the transcode lock/stall
interval configurable with `maxStalledCount: 2`. API: cancel and delete
services and routes (abort upload, conditional cancel, remove jobs, delete all
prefixes, then rows), a Redis `RateLimiter`, `UPLOADS_PER_HOUR` and
`MAX_ACTIVE_VIDEOS` via a `beforeCreate` hook, 429 with Retry-After. Notify
worker: a job-scheduled stale-upload sweep. Add `pnpm queues:replay`, Cancel and
Delete buttons, and a chaos test that SIGKILLs a transcode worker process
mid-encode and expects the video to become ready.
