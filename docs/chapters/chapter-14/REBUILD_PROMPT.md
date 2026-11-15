# Chapter 14: Rebuild prompt

Make `docker/Dockerfile` build every service (shared build stage with
`pnpm deploy --prod`; worker runtime with a METRICS_PORT healthcheck; media
runtime with FFmpeg; API with migrations; Next.js standalone web) and a
`build-images.sh`. Add `dist/setup.js` (migrations + bucket setup),
`COOKIE_DOMAIN` cross-subdomain cookies, `S3_PRESIGN_ENDPOINT` for
browser-facing part URLs, and `docker-compose.prod.yml` (Postgres, Redis with
AOF/noeviction, optional RustFS profile, setup job, API, web, five workers with
stop grace and transcode limits, Caddy with app/api/media sites hiding
internal paths). Add `desiredReplicas()` with delayed scale-down, a Compose
autoscaler CLI and a KEDA manifest on `vidflow_queue_jobs`, a load test that
uploads N videos through the API and reports time-to-ready, DEPLOYMENT.md, the
master ARCHITECTURE.md and the final README.
