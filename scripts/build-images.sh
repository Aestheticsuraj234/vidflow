#!/usr/bin/env bash
# Builds every Vidflow image.
#
#   ./scripts/build-images.sh
#   TAG=v1 REGISTRY=ghcr.io/you PUSH=1 ./scripts/build-images.sh
#   NEXT_PUBLIC_API_URL=https://api.example.com ./scripts/build-images.sh
#   BASE_REGISTRY=public.ecr.aws/docker/library EXTRA_CA_CERT=ca.crt ./scripts/build-images.sh
set -euo pipefail

cd "$(dirname "$0")/.."
TAG="${TAG:-latest}"
REGISTRY="${REGISTRY:-}"
TARGETS=(api web probe-worker transcode-worker package-worker thumbnail-worker notify-worker)
ARGS=(--build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-http://localhost:4000}")
[[ -n "${BASE_REGISTRY:-}" ]] && ARGS+=(--build-arg "BASE_REGISTRY=${BASE_REGISTRY}")
[[ -n "${EXTRA_CA_CERT:-}" ]] && ARGS+=(--secret "id=extra_ca,src=${EXTRA_CA_CERT}")

for target in "${TARGETS[@]}"; do
  name="vidflow-${target}:${TAG}"
  [[ -n "$REGISTRY" ]] && name="${REGISTRY}/${name}"
  echo "==> ${name}"
  docker build -q -f docker/Dockerfile --target "$target" "${ARGS[@]}" -t "$name" . >/dev/null
  [[ "${PUSH:-0}" == "1" ]] && docker push "$name"
done
echo "Built ${#TARGETS[@]} images (tag ${TAG})."
