# Chapter 2: Database and ORM layer setup

**Goal:** one typed database layer that every service shares, with a video
state machine that makes illegal moves impossible.

## What you get

- `packages/db` on Drizzle ORM: auth tables, `videos`, `renditions`, `assets`,
  `video_events`, `webhooks`, `webhook_deliveries`, `api_keys`
- Enums: `video_status`, `rendition_status`, `asset_kind`, `webhook_delivery_status`
- Video state machine (`canTransitionVideo`, `allowedFrom`) and an atomic
  `VideoRepository.transition()`
- `VideoRepository`: videos, renditions (one per name), assets (upsert by key), timeline
- `ApiKeyRepository` (keys look like `vf_…`, only SHA-256 hashes stored)
- Migration `0000_initial-schema.sql`; Better Auth on the Drizzle adapter
- `pnpm test` migrates once before any package's tests

[IMPLEMENTATION](IMPLEMENTATION.md) · [ARCHITECTURE](ARCHITECTURE.md) ·
[TESTING](TESTING.md) · [PR_REVIEW](PR_REVIEW.md) · [REBUILD_PROMPT](REBUILD_PROMPT.md)

**Next:** Chapter 3, object storage.
