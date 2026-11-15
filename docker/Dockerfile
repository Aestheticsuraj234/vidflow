# syntax=docker/dockerfile:1
# Production images for Vidflow: one build stage, one small runtime per service.
#
#   docker build -f docker/Dockerfile --target <name> -t vidflow-<name> .
#   names: api, web, probe-worker, transcode-worker, package-worker,
#          thumbnail-worker, notify-worker
#   (or ./scripts/build-images.sh to build them all)
#
# Optional: --build-arg BASE_REGISTRY=public.ecr.aws/docker/library (Docker Hub
# rate limits) and --secret id=extra_ca,src=ca.crt (TLS-intercepting proxy).
# The web image bakes in the API's public URL: --build-arg NEXT_PUBLIC_API_URL=…

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
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm turbo run build --filter='./apps/*'
# Self-contained folders with only production dependencies.
RUN --mount=type=secret,id=extra_ca,required=false \
    --mount=type=cache,id=pnpm,target=/pnpm/store \
    NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca sh -c '\
      for app in api probe-worker transcode-worker package-worker thumbnail-worker notify-worker; do \
        pnpm --filter @vidflow/$app deploy --prod --legacy /out/$app || exit 1; \
      done'

# Shared by every worker: Node plus a health probe on METRICS_PORT.
FROM ${BASE_REGISTRY}/node:22-slim AS worker-runtime
ENV NODE_ENV=production METRICS_PORT=9465
WORKDIR /app
HEALTHCHECK --interval=15s --timeout=3s --retries=4 \
  CMD node -e "fetch('http://localhost:'+process.env.METRICS_PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

# Plus FFmpeg for the media workers. Debian's FFmpeg has libx264 and AAC; swap
# in a static build here for newer codecs or a smaller image.
FROM worker-runtime AS media-runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libx264 \
  && mkdir -p /tmp/vidflow && chown node /tmp/vidflow
# Scratch space for encodes; mount a fast volume here for big files.
ENV TRANSCODE_TMP_DIR=/tmp/vidflow PACKAGE_TMP_DIR=/tmp/vidflow THUMBNAIL_TMP_DIR=/tmp/vidflow

FROM ${BASE_REGISTRY}/node:22-slim AS api
WORKDIR /app
ENV NODE_ENV=production MIGRATIONS_DIR=/app/drizzle
COPY --from=build /out/api ./
COPY --from=build /repo/packages/db/drizzle ./drizzle
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD node -e "fetch('http://localhost:'+(process.env.API_PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/index.js"]

FROM media-runtime AS probe-worker
COPY --from=build /out/probe-worker ./
USER node
CMD ["node", "dist/index.js"]

FROM media-runtime AS transcode-worker
COPY --from=build /out/transcode-worker ./
USER node
CMD ["node", "dist/index.js"]

FROM media-runtime AS package-worker
COPY --from=build /out/package-worker ./
USER node
CMD ["node", "dist/index.js"]

FROM media-runtime AS thumbnail-worker
COPY --from=build /out/thumbnail-worker ./
USER node
CMD ["node", "dist/index.js"]

# Webhooks and housekeeping need no FFmpeg.
FROM worker-runtime AS notify-worker
COPY --from=build /out/notify-worker ./
USER node
CMD ["node", "dist/index.js"]

FROM ${BASE_REGISTRY}/node:22-slim AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
