# Chapter 11: Rebuild prompt

API: return `VideoDetail` from `GET /v1/videos/:id` (renditions, previewsUrl,
timeline, fps/codec/audio); accept `Authorization: Bearer vf_…` in the session
middleware (hash lookup, revoked rejected, owner as user, non-blocking
lastUsed); add `/v1/api-keys` and `requireSession` for keys and webhooks; mount
Bull Board (`@bull-board/hono`, all queues) at `/admin/queues` for
`ADMIN_EMAILS` only, 404 otherwise. Web: a `VideoPlayer` with lazy hls.js,
native HLS fallback, quality menu (Auto/pinned), custom seek bar with
sprite/VTT previews, mute and fullscreen; `parsePreviewVtt`/`cueAt`; `/library`,
`/videos/[id]` (player or processing state, renditions, facts, live timeline)
and `/api-keys` pages, all patched live from `/v1/live`.
