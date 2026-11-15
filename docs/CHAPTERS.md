# Vidflow: chapters

> Working name. Rename anytime.

Vidflow is a self-hosted video platform backend: upload a video and it is
probed, transcoded into several qualities, packaged for adaptive streaming
(HLS), given thumbnails and preview sprites, and published to a CDN, with
live progress and webhooks. Each stage is its own microservice connected by
BullMQ queues, so every stage scales on its own.

14 chapters, one feature each, plus two bonus chapters. All TypeScript. One
tool per job: Hono for the API, Drizzle + Postgres for data, Redis + BullMQ
for queues and flows (and Redis pub/sub for live progress), MinIO locally and
S3 / Cloudflare R2 in production for storage, FFmpeg for media, hls.js for
playback, Prometheus + Grafana for metrics, Caddy for HTTPS.

## Services

| Service            | Queue it consumes | Job                                                   |
| ------------------ | ----------------- | ----------------------------------------------------- |
| `api`              | –                 | Auth, uploads, videos, API keys, SSE, webhooks config |
| `probe-worker`     | `probe`           | ffprobe, validation, choose the rendition ladder      |
| `transcode-worker` | `transcode`       | FFmpeg encode one rendition (CPU heavy, scale most)   |
| `package-worker`   | `package`         | HLS segments + master playlist                        |
| `thumbnail-worker` | `thumbnail`       | Poster, thumbnails, scrub-preview sprite + VTT        |
| `notify-worker`    | `notify`          | Signed webhooks with retries                          |
| `web`              | –                 | Upload page, library, player, job timeline            |

## Chapters

| #   | Chapter                                     | What it adds                                                                                                                        | Status   |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | Project init and authentication setup       | Turborepo + pnpm monorepo, Hono API, Better Auth, Next.js web with sign-up/sign-in, design system, CI                               | ✅ Done  |
| 2   | Database and ORM layer setup                | Drizzle schema (videos, sources, renditions, assets, jobs, webhooks, api_keys), video state machine, migrations, Repository pattern | ✅ Done  |
| 3   | Object storage layer                        | `StorageProvider` interface (Strategy): RustFS locally, S3 / R2 in production; presigned URLs; bucket layout and lifecycle rules    | ✅ Done  |
| 4   | Resumable direct uploads                    | S3 multipart uploads straight from the browser (presigned parts), resume after refresh, size and type checks, upload UI             | ✅ Done  |
| 5   | Queue architecture and BullMQ Flows         | One queue per stage, typed job contracts, a Flow (DAG) per video, idempotent job IDs, priorities, shared `packages/queues`          | ✅ Done  |
| 6   | Probe service                               | `probe-worker`: ffprobe metadata, rejects bad files, picks the rendition ladder (never upscales), starts the transcode flow         | ✅ Done  |
| 7   | Transcode service                           | `transcode-worker`: FFmpeg H.264/AAC per rendition, live progress from FFmpeg, CPU limits, temp-disk hygiene, FFmpeg image          | ✅ Done  |
| 8   | HLS packaging and adaptive streaming        | `package-worker`: fMP4 HLS segments per rendition, master playlist, CDN-friendly paths and cache headers                            | ✅ Done  |
| 9   | Thumbnails and preview sprites              | `thumbnail-worker`: poster, thumbnails at intervals, scrub-preview sprite sheet + WebVTT, runs in parallel with transcoding         | ✅ Done  |
| 10  | Real-time progress and webhooks             | Progress over Redis pub/sub → SSE; `notify-worker` sends HMAC-signed webhooks with backoff and a delivery log                       | ✅ Done  |
| 11  | Player and dashboard UI                     | hls.js player with quality switcher and scrub previews, video library, upload page, per-video job timeline, Bull Board admin        | ✅ Done  |
| 12  | Reliability: retries, cancellation, cleanup | Retries vs dead-letter queue, stalled jobs, cancel a video mid-flow, delete and storage cleanup, rate limits per user, chaos tests  | ✅ Done  |
| 13  | Observability                               | Structured logs per service, Prometheus metrics (queue depth, encode speed, failures), alerts, Grafana dashboard                    | ✅ Done  |
| 14  | Deployment, autoscaling and load testing    | Image per service, production Compose + Caddy, R2 + CDN, scale transcode workers by queue depth, load test, final README            | ⏸ Next   |
| ★1  | Bonus: Kubernetes with KEDA                 | Helm chart, KEDA autoscaling each worker on its BullMQ queue length, scale to zero                                                  | Optional |
| ★2  | Bonus: GPU encoding                         | NVENC transcode worker on a GPU node, routed by a `gpu` queue                                                                       | Optional |

## Life of a video

```
upload (multipart → storage) ─▶ api: video "uploaded" ─▶ probe
probe ─▶ Flow:  package (parent)
                 ├─ transcode 1080p ─┐
                 ├─ transcode 720p  ─┤  children run in parallel
                 ├─ transcode 480p  ─┤  on any number of workers
                 └─ transcode 360p  ─┘
        + thumbnail (in parallel)
package ─▶ master.m3u8 on the CDN ─▶ video "ready" ─▶ notify (webhook) + SSE
```

## Every chapter ships with

- Plan and acceptance criteria, then code, tests, lint, typecheck and build
- A review against the Google TypeScript Style Guide
- Diagrams in `docs/chapters/chapter-XX/architecture/`
- Docs: README, IMPLEMENTATION, ARCHITECTURE, TESTING, PR_REVIEW, REBUILD_PROMPT
- Its own `feat/chapter-XX-*` branch with Conventional Commits, merged into `main`

After Chapter 14: integration review, full test suite, master architecture
diagram and `docs/REBUILD_PROJECT_PROMPT.md`.
