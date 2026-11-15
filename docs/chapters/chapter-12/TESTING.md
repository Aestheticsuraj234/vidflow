# Chapter 12: Testing

```bash
pnpm test          # includes the tests below
pnpm test:chaos    # ~1 minute; real worker processes, needs FFmpeg
```

- `packages/queues/test/reliability.test.ts`: `cancelVideo` removes the probe,
  thumbnail, transcodes and package of one video and leaves another's flow
  alone; a job failing for good lands in `dead` with its error and replays to
  completion; unknown letters return `not-found`
- `apps/api/test/lifecycle.test.ts`: cancel a processing video (jobs gone,
  public and source files gone, second cancel 409); cancel during upload;
  delete removes files and rows; other users get 404; 3rd upload with a limit
  of 2 per hour → 429 `rate_limited` with `Retry-After`; second video with
  `MAX_ACTIVE_VIDEOS=1` → 429
- `apps/notify-worker/test/maintenance.test.ts`: a 25-hour-old upload is
  canceled and its multipart upload aborted; a fresh one is untouched
- `tests/chaos/kill-workers.test.ts`:

```
ready 52.8s after the kill; recovered: transcode-…-480p
```

`pnpm queues:replay` lists dead letters; `pnpm queues:replay --all` retries them.
