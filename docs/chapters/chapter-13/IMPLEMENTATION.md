# Chapter 13: Implementation

1. **Logs.** pino, one JSON line per event with `service`, ISO time and the level
   as a word. `redact` blanks `secret`, `password`, `authorization` and cookies
   anywhere they appear. The job lifecycle logs from Chapter 5 now go through
   it, so every job start, completion (with duration) and failure (with attempt)
   is a searchable line. The API logs one line per request with the route
   pattern, status and milliseconds; tests log at `silent`.
2. **Metrics registry.** One `prom-client` registry per process, default label
   `service`, Node defaults (CPU, memory, event-loop lag, GC) prefixed `vidflow_`.
3. **Job metrics** (`instrumentWorker`): `vidflow_jobs_total{queue,outcome}`
   where outcome is `completed`, `retried` or `failed` (for good);
   `vidflow_job_duration_seconds{queue}`; `vidflow_jobs_active{queue}`;
   `vidflow_jobs_stalled_total{queue}`.
4. **Encode speed.** The transcode processor reports seconds of video per
   second of work; `vidflow_encode_speed_ratio{rendition}` shows when workers
   are CPU-starved before users notice.
5. **Queue depth** is computed when Prometheus scrapes the API (a gauge with
   `collect()` calling `Pipeline.counts()`), so it's never stale and needs no
   extra process. Every API replica reports the same numbers; queries use `max`.
6. **Cardinality.** HTTP metrics use `c.req.routePath` (`/v1/videos/:id`), never
   the raw path, so a million videos are still one series.
7. **Worker endpoints.** `startMetricsServer(port, registry, healthy)` serves
   `/metrics` and `/health`; health is "Redis answers", which is what Docker and
   Kubernetes probes act on.
8. **Alerts** (`deploy/observability/alerts.yml`): service down (2 m), transcode
   backlog > 20 for 10 m, > 5 jobs failed for good in 15 m per queue, dead
   letters waiting 30 m, > 3 stalls in 15 m, median encode slower than realtime
   for 15 m, API 5xx > 5% for 5 m. Each has a summary, and runbook hints where useful.
9. **Dashboard** (provisioned JSON): stats (backlog, encoding now, videos ready,
   failures, dead letters, live viewers), queue depth, active jobs, throughput,
   p95 job duration, encode speed, stalls, API rate and p95 latency per route,
   memory and event-loop lag.
