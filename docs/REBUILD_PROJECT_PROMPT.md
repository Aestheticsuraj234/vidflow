# Rebuild Vidflow from one prompt

Build **Vidflow**, a scalable video transcoding pipeline, as a TypeScript
monorepo (Turborepo, pnpm 10, Node 22, TypeScript 6, ESLint flat config,
Prettier). Work in 14 chapters, one branch and PR each, with tests against real
Postgres, Redis, S3-compatible storage (RustFS locally) and FFmpeg.

1. **Init and auth.** `apps/api` (Hono, Better Auth email/password,
   `createApp(deps)`, zod env, `AppError`, tsup bundling only `@vidflow/*`),
   `apps/web` (Next.js 16, Tailwind 4, dark theme with a violet accent, sign-in
   and sign-up, dashboard), `packages/shared`, CI, API smoke test.
2. **Database.** `packages/db` on Drizzle: videos (status machine
   created→uploading→uploaded→probing→processing→ready, plus failed/canceled),
   renditions (unique per name), assets, video_events, webhooks,
   webhook_deliveries, api_keys; `VideoRepository.transition()` as one
   conditional update.
3. **Storage.** `StorageProvider` + `S3StorageProvider` (checksums
   `WHEN_REQUIRED`, path style, optional browser presign endpoint), key layout
   (`sources/`, `work/`, `public/videos/{id}/`), cache headers, idempotent bucket
   setup (CORS exposing ETag, public read policy, abort incomplete uploads).
4. **Resumable uploads.** Multipart API (create, sign parts, list stored parts,
   complete with HEAD size check, abort), `planParts()`, a browser uploader with
   4 parallel parts, retries, XHR progress, fingerprint resume; upload page.
5. **Queues.** BullMQ 6: one queue per stage, zod job contracts, deterministic
   `-` job IDs, priorities by duration, a Flow (package parent, transcode
   children, `failParentOnFailure`), typed `createWorker`, graceful shutdown.
6. **Probe.** ffprobe on a presigned URL, rotation-aware, invalid media vs
   transient errors, ladder (≤4 rungs, no upscaling, portrait, even sizes,
   bitrate scaling/caps), 2 s GOP, re-runnable processor.
7. **Transcode.** `runFfmpeg` with `-progress` parsing, abort, timeout;
   `h264Args` (capped VBR, fixed GOP, scene-cut off, auto-rotate, faststart);
   throttled progress roll-up, cancel mid-encode, temp-dir hygiene; Dockerfile
   with an FFmpeg runtime.
8. **HLS.** `-c copy` fMP4 HLS, measured peak/average bandwidth, codec strings
   from probing the output, master playlist, immutable segments, video ready,
   delete intermediates, `playbackUrl`.
9. **Thumbnails.** Poster (10%, `thumbnail` filter), ≤100-tile sprite + WebVTT,
   outside the flow.
10. **Live + webhooks.** Repository change hook → coalesced Redis pub/sub per
    user → SSE with one subscriber per process; webhook endpoints (one-time
    secret), idempotent fan-out, per-delivery jobs, HMAC `t=…,v1=…`, retry
    rules, SSRF guard in the socket lookup; shared worker runtime.
11. **UI.** hls.js player with quality menu and sprite scrub previews, library,
    video page with renditions and live timeline, API keys (Bearer auth, can't
    manage keys/webhooks), Bull Board for admins only.
12. **Reliability.** Dead-letter queue + replay, stall settings, cancel and
    delete (remove queued jobs, stop encodes, delete storage), Redis rate limits
    and active-video cap, stale-upload sweep via job scheduler, chaos test that
    SIGKILLs a transcode worker.
13. **Observability.** pino JSON logs, prom-client metrics (jobs, durations,
    active, stalls, encode speed, HTTP by route pattern, scrape-time queue
    depth), `/metrics` + `/health` per worker, alert rules, Grafana dashboard.
14. **Deployment.** One image per service (healthchecks), production Compose
    with a setup job, Caddy (HTTPS, internal paths hidden, media host for
    self-hosted storage), R2 guidance, autoscaling (policy + Compose loop, KEDA
    manifest), load test, final docs.

Every chapter ships `docs/chapters/chapter-NN/` with README, IMPLEMENTATION,
ARCHITECTURE (+ Mermaid diagrams), TESTING, PR_REVIEW and REBUILD_PROMPT.
