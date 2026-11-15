# Chapter 13: Testing

```bash
pnpm --filter @vidflow/observability test
pnpm --filter @vidflow/api test
docker compose -f deploy/observability/docker-compose.yml up -d   # Prometheus :9090, Grafana :3001
```

- `packages/observability/src/observability.test.ts`: a fake worker emitting
  active/completed/failed (retry and final)/stalled produces the right counters,
  duration sum and active gauge; the metrics server serves `/metrics` and
  `/health` (200, then 503 when unhealthy)
- `apps/api/test/metrics.test.ts`: request counted under `/v1/videos/:id`;
  `vidflow_queue_jobs{queue="probe",state="waiting"} 1` after an enqueue;
  `METRICS_TOKEN` enforced
- `promtool check rules alerts.yml`: 7 rules

## Live

With the full stack and the monitoring compose running, Prometheus showed all
six targets up and all seven rules healthy. Three browser uploads filled the
dashboard above (encode speed 3×–6× realtime). Stopping the thumbnail worker
fired `VidflowServiceDown` after the 2-minute window:

```
VidflowServiceDown firing thumbnail  workers localhost:9468 is not answering /metrics
```
