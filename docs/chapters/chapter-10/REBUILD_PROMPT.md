# Chapter 10: Rebuild prompt

Add an `onChange` hook to `VideoRepository` (transition, update,
refreshProgress, addEvent). In `@vidflow/queues` add `LivePublisher`
(250 ms per-video coalescing, keeps timeline events, publishes to
`{prefix}:live:user:{id}`) and `LiveHub` (one subscriber per process,
per-user listener sets), plus a `deliver` queue with `enqueueDeliveries`
(8 attempts, 10 s exponential). Add `@vidflow/worker-runtime` (db, storage,
pipeline, live publisher, `failVideo` that sends `video.failed`). Add a unique
(webhook, video, event) index and `WebhookRepository`. Add `apps/notify-worker`:
fan-out with idempotent deliveries, HMAC-SHA256 `t=…,v1=…` signing, POST via
http(s) with a private-address-refusing `lookup`, no redirects, retry rules by
status, attempt logging. API: `GET /v1/live` (SSE, ready event, heartbeat) and
`/v1/webhooks` CRUD + deliveries + test; send `video.uploaded`. Web:
`useLiveVideos`, live rows on the upload page, Webhooks page.
