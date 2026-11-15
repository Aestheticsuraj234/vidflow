# Chapter 10: Implementation

## Live progress

1. **One choke point.** `VideoRepository` calls `onChange({videoId, event?})`
   after `transition`, `update`, `refreshProgress` and `addEvent`. Nothing else
   needs to remember to publish. Errors in the hook are swallowed: a live update
   must never fail a write.
2. **`LivePublisher`** collects changes per video for 250 ms, then loads the
   current state once and publishes to `vidflow:live:user:{userId}`. Twenty
   progress writes become one message; timeline events are never dropped
   (one message each, all carrying the latest state).
3. **`LiveHub`** holds one Redis subscriber per API process. The first tab of
   a user subscribes to their channel, the last one to close unsubscribes, and
   messages fan out in memory. 10,000 open dashboards cost one Redis
   connection per API instance, not 10,000.
4. **`GET /v1/live`** uses Hono's `streamSSE`: an initial `ready` event, then
   `event: video` messages with incrementing IDs, a `: ping` comment every 15 s
   so proxies keep the connection, and `X-Accel-Buffering: no` for nginx.
5. **Why SSE, not WebSockets.** Updates only flow server → browser. SSE is plain
   HTTP, works through every proxy, sends cookies, and `EventSource` reconnects
   by itself.
6. **Web.** `useLiveVideos` wraps `EventSource` (`withCredentials`). The upload
   page patches the matching row's status and progress in place and refetches
   when a video it doesn't know appears or goes ready (for poster and URL).

## Webhooks

7. **Endpoints.** `whsec_` + 32 random bytes; returned once on create, then only
   a hint (`whsec_…JRK8`). HTTPS required in production.
8. **Fan-out (`notify` queue).** One job per video event (idempotent ID). It
   finds active endpoints subscribed to the event, builds the payload (video,
   playback and poster URLs) and inserts deliveries. A unique
   (webhook, video, event) index plus `onConflictDoNothing` means a retried
   notify job creates and sends nothing twice.
9. **Delivery (`deliver` queue).** One job per delivery so a slow endpoint
   never holds up the others. Body `{id, type, createdAt, data}`; headers
   `Vidflow-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "t.body")>`,
   `Vidflow-Event`, `Vidflow-Delivery`. 2xx → delivered. 408/409/425/429/5xx,
   timeouts and connection errors → retried (10 s, 20 s, 40 s …, 8 attempts).
   Other 4xx → failed now. Every attempt updates the log row.
10. **SSRF.** URLs are user input. Private, loopback, link-local (cloud
    metadata), CGNAT and IPv6 unique-local addresses are refused. The check runs
    in the socket's DNS `lookup`, on the address actually connected to, so a DNS
    answer that changes between check and connect can't slip through.
    Redirects aren't followed. `WEBHOOK_ALLOW_PRIVATE=true` is for local dev only.
11. **Who sends what.** API: `video.uploaded`. Probe worker: `video.processing`.
    Package worker: `video.ready`. `failVideo()` in the runtime: `video.failed`,
    only if this call actually failed the video.
12. **Receivers verify** with the snippet in TESTING.md (`verifySignature` is
    exported for reference): constant-time compare, 5-minute timestamp window.
