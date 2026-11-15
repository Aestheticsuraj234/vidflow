# Chapter 13: Rebuild prompt

Add `@vidflow/observability`: pino `createLogger(service)` (ISO time, level
names, redaction), `createMetrics(service)` (registry with default labels and
Node metrics; jobs_total{queue,outcome}, job_duration_seconds, jobs_active,
encode_speed_ratio{rendition}, jobs_stalled_total), `instrumentWorker` and
`startMetricsServer(port, registry, healthy)`. Give the worker runtime a logger,
metrics and a `METRICS_PORT` server (health = Redis), use them in all workers,
and report encode speed from transcode. API: pino request logs, HTTP counters
and latency by route pattern, scrape-time queue-depth and SSE gauges, uploads
counter, `GET /metrics` with optional token. Add `deploy/observability` with
Prometheus config, seven alert rules and a provisioned Grafana dashboard.
