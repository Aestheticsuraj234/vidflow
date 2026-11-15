# Chapter 5: Testing

```bash
pnpm --filter @vidflow/queues test     # needs Redis
pnpm queues:stats --watch              # live counts while you test
```

`packages/queues/test/pipeline.test.ts` runs against real Redis under a
per-process prefix and obliterates its queues after each test:

- job IDs contain no `:`; priorities; `redis://` and `rediss://` URL parsing
- three concurrent `enqueueProbe` calls for one video → one job
- a two-rendition Flow: `package` runs last and sees both transcode results; thumbnail job exists
- a transcode that always fails: 3 attempts, the parent fails with "child … failed", the package processor never runs
- malformed data: fails on the first attempt, processor never called
- `counts()` covers every queue; `isAvailable()` is true, and false within a second for a dead Redis

API: completing an upload creates `probe-{id}`; `/health` returns 503 with
`redis: down` when Redis is unreachable.
