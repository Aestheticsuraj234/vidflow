# Chapter 3: Object storage

**Goal:** one storage layer every service shares, backed by S3-compatible
object storage, with a bucket layout that keeps uploads private and makes
playback files public and cacheable.

## What you get

- `packages/storage`: a `StorageProvider` interface and `S3StorageProvider`
  (RustFS locally, Cloudflare R2 or AWS S3 in production, no code changes)
- Presigned GETs for private objects and presigned multipart part uploads for
  the browser (used in Chapter 4)
- `keys` helpers: `sources/` and `work/` private, `public/videos/{id}/` public
- `CACHE` headers: immutable segments, short-lived playlists
- `pnpm storage:setup`: bucket, CORS (exposes `ETag`), `public/*` read policy,
  and a lifecycle rule that aborts abandoned uploads after a day
- RustFS in `docker-compose.yml` and CI; `/health` now checks storage too

[IMPLEMENTATION](IMPLEMENTATION.md) · [ARCHITECTURE](ARCHITECTURE.md) ·
[TESTING](TESTING.md) · [PR_REVIEW](PR_REVIEW.md) · [REBUILD_PROMPT](REBUILD_PROMPT.md)

**Next:** Chapter 4, resumable direct uploads.
