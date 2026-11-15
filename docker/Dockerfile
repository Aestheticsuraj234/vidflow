# syntax=docker/dockerfile:1
# Production images for Vidflow. One build stage, one small runtime per service:
#
#   docker build -f docker/Dockerfile --target api              -t vidflow-api .
#   docker build -f docker/Dockerfile --target probe-worker     -t vidflow-probe-worker .
#   docker build -f docker/Dockerfile --target transcode-worker -t vidflow-transcode-worker .
#   docker build -f docker/Dockerfile --target package-worker   -t vidflow-package-worker .
#   docker build -f docker/Dockerfile --target thumbnail-worker -t vidflow-thumbnail-worker .
#
# Optional: --build-arg BASE_REGISTRY=public.ecr.aws/docker/library (Docker Hub
# rate limits) and --secret id=extra_ca,src=ca.crt (TLS-intercepting proxy).

ARG BASE_REGISTRY=docker.io/library

FROM ${BASE_REGISTRY}/node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=secret,id=extra_ca,required=false \
    NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca npm install -g pnpm@10.28.0
WORKDIR /repo

FROM base AS build
COPY . .
RUN --mount=type=secret,id=extra_ca,required=false \
    --mount=type=cache,id=pnpm,target=/pnpm/store \
    NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter='./apps/*' --filter='!@vidflow/web'
# Self-contained folders with only production dependencies.
RUN --mount=type=secret,id=extra_ca,required=false \
    --mount=type=cache,id=pnpm,target=/pnpm/store \
    NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca sh -c '\
      for app in api probe-worker transcode-worker package-worker thumbnail-worker notify-worker; do \
        pnpm --filter @vidflow/$app deploy --prod --legacy /out/$app || exit 1; \
      done'

# Node plus FFmpeg, for every media worker. Debian's FFmpeg is built with
# libx264 and AAC; swap in a static build here for newer codecs.
FROM ${BASE_REGISTRY}/node:22-slim AS media-runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libx264
ENV NODE_ENV=production TRANSCODE_TMP_DIR=/tmp/vidflow
WORKDIR /app

FROM ${BASE_REGISTRY}/node:22-slim AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out/api ./
USER node
EXPOSE 4000
CMD ["node", "dist/index.js"]

FROM media-runtime AS probe-worker
COPY --from=build /out/probe-worker ./
USER node
CMD ["node", "dist/index.js"]

# Encodes write to /tmp/vidflow; mount a fast volume there for big files.
FROM media-runtime AS transcode-worker
COPY --from=build /out/transcode-worker ./
RUN mkdir -p /tmp/vidflow && chown node /tmp/vidflow
USER node
CMD ["node", "dist/index.js"]

FROM media-runtime AS package-worker
COPY --from=build /out/package-worker ./
RUN mkdir -p /tmp/vidflow && chown node /tmp/vidflow
ENV PACKAGE_TMP_DIR=/tmp/vidflow
USER node
CMD ["node", "dist/index.js"]

FROM media-runtime AS thumbnail-worker
COPY --from=build /out/thumbnail-worker ./
RUN mkdir -p /tmp/vidflow && chown node /tmp/vidflow
ENV THUMBNAIL_TMP_DIR=/tmp/vidflow
USER node
CMD ["node", "dist/index.js"]

# Webhooks need no FFmpeg: a plain Node image.
FROM ${BASE_REGISTRY}/node:22-slim AS notify-worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out/notify-worker ./
USER node
CMD ["node", "dist/index.js"]
