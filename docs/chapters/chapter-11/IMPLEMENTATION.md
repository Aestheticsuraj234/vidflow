# Chapter 11: Implementation

1. **Player engine.** hls.js is imported lazily (it's ~150 KB). Where
   `Hls.isSupported()` (MSE), it loads the master playlist with
   `capLevelToPlayerSize` (no 1080p into a 400 px box). Safari and iOS play HLS
   natively. Fatal errors show an overlay.
2. **Quality menu.** Levels come from `MANIFEST_PARSED`. "Auto" sets
   `hls.currentLevel = -1` (bandwidth estimation); picking a rendition pins it.
   `LEVEL_SWITCHED` keeps the label honest ("Auto (720p)").
3. **Scrub previews.** `parsePreviewVtt` reads Chapter 9's VTT and resolves
   `sprite.jpg` against the VTT URL. On hover, `cueAt` (binary search) finds the
   tile and a `div` shows it with `background-position: -x -y`. One image
   request serves every preview.
4. **Library and video page** load once, then apply `GET /v1/live` messages:
   status and progress patch in place, timeline events append, and milestones
   (thumbnail done, ready) trigger a refetch for posters, renditions and the URL.
5. **Video detail.** `GET /v1/videos/:id` returns summary + fps/codec/audio,
   renditions (status, progress, size, encode time), `previewsUrl` and the
   timeline, in three parallel queries.
6. **API keys.** The session middleware also accepts `Bearer vf_…`: the hash is
   looked up, revoked keys rejected, the owner loaded as the request's user and
   `lastUsedAt` updated without blocking. `requireSession` keeps keys away from
   managing keys and webhooks, so a leaked key can't create a webhook that
   exfiltrates every future video.
7. **Bull Board.** `@bull-board/hono` with `serveStatic` from
   `@hono/node-server`, one adapter per queue from `Pipeline.queue()`. The
   middleware returns 404 unless the session email is in `ADMIN_EMAILS`.
8. **Routes** use `useParams()` from `next/navigation` (client component), as
   the bundled Next.js 16 docs describe.
