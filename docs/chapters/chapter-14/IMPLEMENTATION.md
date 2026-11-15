# Chapter 14: Implementation

1. **Images.** One build stage (`pnpm install`, `turbo build`, `pnpm deploy
--prod` per app), small runtimes:
   - `worker-runtime`: Node + a `HEALTHCHECK` on `METRICS_PORT/health`
   - `media-runtime`: + Debian FFmpeg (libx264 checked at build), scratch dir
   - `api` (with `drizzle/` for migrations), `web` (Next.js standalone)
   - sizes: media workers 1.06 GB, API 580 MB, web and notify 414 MB
2. **Setup job.** `dist/setup.js` in the API image: migrations then
   `setupBucket` (CORS for `WEB_URL`, policy, lifecycle). Compose runs it once
   per deploy; API and workers wait for `service_completed_successfully`.
3. **Cookies across subdomains.** `COOKIE_DOMAIN=example.com` turns on Better
   Auth's cross-subdomain cookies, so `app.` can see the session `api.` sets.
4. **Caddy.** Automatic HTTPS for plain hostnames; `CADDY_GLOBAL_OPTIONS=local_certs`
   for staging/local. The API site 404s `/metrics` and `/admin/queues` and
   flushes SSE immediately. The media site (self-hosted only) forwards
   `GET/HEAD` under `/{bucket}/public/` and `PUT` under `/{bucket}/sources/`
   (presigned parts); everything else 404s.
5. **Presign endpoint.** With self-hosted storage, services talk to
   `http://storage:9000`, but browsers must upload to `https://media.…`. SigV4
   signs the host, so `S3StorageProvider` keeps a second client for
   browser-facing part URLs (`S3_PRESIGN_ENDPOINT`). Workers' presigned GETs
   stay internal.
6. **Workers in production.** `stop_grace_period: 120s` lets an encode finish
   on deploy; transcode replicas get CPU/memory limits and a tmpfs scratch;
   Redis runs with AOF (queued jobs survive restarts) and `noeviction` (BullMQ
   requirement).
7. **Autoscaling.** `desiredReplicas({waiting, active}, state, policy)`: target
   = active + ceil(waiting / jobsPerReplica), clamped; up at once, down only
   after `scaleDownDelaySec` of lower demand, cancelled if load returns.
   `pnpm autoscale` polls every 15 s and runs `docker compose up -d
--no-recreate --scale transcode-worker=N`. On Kubernetes, KEDA's Prometheus
   trigger reads the same queue-depth metric (`deploy/k8s/transcode-worker.yaml`).
8. **Load test** (`tests/load`): signs up a throwaway user, creates an API key,
   uploads `COUNT` copies through the multipart API, `CONCURRENCY` at a time,
   honours `429 Retry-After`, polls until ready, writes `load-report.json`.
