# Deploying Vidflow

One machine with Docker is enough to start; every service is stateless except
Postgres, Redis and the bucket, so the same images move to Kubernetes later.

## 1. Storage

**Cloudflare R2 (recommended).** Egress is free, which matters for video.

1. Create a bucket (e.g. `vidflow`) and an API token with object read/write.
2. Connect a custom domain to the bucket (e.g. `media.example.com`). That's
   your `S3_PUBLIC_BASE_URL`; Cloudflare's CDN caches segments at the edge.
3. A custom domain serves the whole bucket, so add a WAF custom rule on
   `media.example.com`: _block_ when the URI path does not start with
   `/public/`. Sources and intermediate files stay private.
4. `S3_PUBLIC_READ_POLICY=false` (R2 has no bucket policies; the domain does it).
   The setup job still applies CORS and the lifecycle rule through the S3 API.

**AWS S3** works the same way (CloudFront in front, an origin access policy for
`public/*`). **Self-hosted**: start the `storage` profile (RustFS) and set the
option B variables in `.env.production.example`; Caddy then exposes only public
reads and presigned uploads on `MEDIA_ADDRESS`.

## 2. Configure and start

```bash
cp .env.production.example .env.production   # fill in hostnames, secrets, storage
NEXT_PUBLIC_API_URL=https://api.example.com ./scripts/build-images.sh
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

Point DNS for `app.`, `api.` (and `media.` when self-hosting) at the machine.
Caddy gets certificates on first request. The `setup` service runs migrations
and bucket setup on every deploy and exits; everything else waits for it.

| Service                          | Scale                                     | Notes                                 |
| -------------------------------- | ----------------------------------------- | ------------------------------------- |
| `api`                            | 1–N behind Caddy                          | Stateless; SSE fan-out via Redis      |
| `web`                            | 1–N                                       | Next.js standalone                    |
| `transcode-worker`               | `TRANSCODE_REPLICAS`, or `pnpm autoscale` | 2 CPUs each by default, tmpfs scratch |
| `probe/package/thumbnail-worker` | 1–2                                       | Light; raise concurrency first        |
| `notify-worker`                  | 1–2                                       | Webhooks and maintenance              |
| `postgres`, `redis`              | 1                                         | Redis with AOF and `noeviction`       |

## 3. Autoscaling

- **Compose:** `pnpm autoscale` on the host polls the transcode queue every 15 s
  and runs `docker compose up --scale transcode-worker=N`. Up immediately when
  jobs wait, down after 5 quiet minutes. Tune with `AUTOSCALE_MIN`,
  `AUTOSCALE_MAX`, `AUTOSCALE_JOBS_PER_REPLICA`, `AUTOSCALE_SCALE_DOWN_SEC`.
- **Kubernetes:** `deploy/k8s/transcode-worker.yaml` scales with KEDA from the
  `vidflow_queue_jobs` metric. `terminationGracePeriodSeconds` lets a pod finish
  its encode before it goes.

## 4. Monitoring

`deploy/observability` has the Prometheus config, alert rules and Grafana
dashboard. In production, scrape `api:4000/metrics` (with `METRICS_TOKEN`) and
each worker's `:9465/metrics` on the internal network; Caddy returns 404 for
`/metrics` and `/admin/queues` from outside. Ship container stdout (JSON) to
your log store.

## 5. Operations

| Task                         | How                                                                       |
| ---------------------------- | ------------------------------------------------------------------------- |
| See queues                   | `/admin/queues` over an SSH tunnel to the API, as an `ADMIN_EMAILS` user  |
| Retry jobs that failed       | `pnpm queues:replay` / `pnpm queues:replay --all`                         |
| Deploy without dropping work | `docker compose up -d`: workers get SIGTERM, finish the job (120 s grace) |
| Back up                      | `pg_dump` nightly; R2/S3 versioning or replication for the bucket         |
| Rotate `BETTER_AUTH_SECRET`  | Signs everyone out; do it on purpose                                      |
