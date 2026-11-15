#!/usr/bin/env bash
# Starts the built API (apps/api/dist) and checks that /health answers.
# Catches packages that resolve in tests (from source) but not in production.
set -euo pipefail

cd "$(dirname "$0")/../apps/api"
PORT="${SMOKE_PORT:-4999}"
API_PORT="$PORT" node --env-file-if-exists=../../.env dist/index.js > /tmp/arena-smoke.log 2>&1 &
pid=$!
trap 'kill $pid 2>/dev/null || true' EXIT

for _ in $(seq 1 30); do
  if body=$(curl -sf "http://localhost:${PORT}/health"); then
    echo "API smoke test passed: ${body}"
    exit 0
  fi
  kill -0 "$pid" 2>/dev/null || break
  sleep 1
done
echo "API smoke test failed:"
cat /tmp/arena-smoke.log
exit 1
