# Chapter 14: Testing

```bash
pnpm --filter @vidflow/queues test     # autoscale policy (4 tests)
pnpm --filter @vidflow/storage test    # presign endpoint split
./scripts/build-images.sh
docker compose -f docker-compose.prod.yml --env-file .env.production --profile storage up -d
API_URL=https://api.example.com FILE=clip.mp4 COUNT=8 CONCURRENCY=4 pnpm load-test
```

## Production stack, locally

All seven images were built and the production Compose file started with the
`storage` profile, Caddy using its internal CA (`local_certs`) on
`app/api/media.vidflow.test:8443`, `COOKIE_DOMAIN=vidflow.test`.

- every service healthy; `setup` applied migrations and configured the bucket
- through Caddy: `/health` 200; `/metrics`, `/admin/queues`, bucket listing and
  direct source reads 404; web 200
- Playwright: sign-up over HTTPS with the cross-subdomain cookie, upload with
  parts PUT straight to the media host, video ready, HLS plays (screenshot)

## Load test with the autoscaler

8 uploads of a 20 s 720p file, 4 at a time, one transcode replica to start,
autoscaler max 4 / 2 jobs per replica / 60 s scale-down:

```
#0 ready upload 1.0s ready 37.5s
…
{"ready": 8, "failed": 0, "videosPerMinute": 2.81,
 "uploadSeconds": {"p50": 1.02, "p95": 1.09},
 "timeToReadySeconds": {"p50": 79.1, "p95": 102.8, "max": 102.8}}

scaling transcode-worker 1 → 3 (backlog 3, active 1)
scaling transcode-worker 3 → 4 (backlog 13, active 3)
scaling transcode-worker 4 → 1 (idle for 60s)
```

The test machine has 2 CPU cores, so extra replicas couldn't add encoding
capacity: this run shows correctness under concurrency and the scaling loop,
not peak throughput. On real hardware each replica brings its own cores, and
time-to-ready under a backlog drops roughly with the replica count. Full
numbers: [load-report.json](load-report.json).
