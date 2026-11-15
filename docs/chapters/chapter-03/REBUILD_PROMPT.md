# Chapter 3: Rebuild prompt

Add `packages/storage` with a `StorageProvider` interface (isAvailable, put,
putFile, getStream, getText, download, head, delete, deletePrefix requiring a
trailing slash, list, presignGet, publicUrl only for `public/` keys, and
multipart create/presignUploadPart/listParts/complete/abort) and an
`S3StorageProvider` on AWS SDK v3 with `forcePathStyle` and checksums set to
`WHEN_REQUIRED`. Add `keys` (sources/, work/, public/videos/{id}/…) and `CACHE`
headers, an idempotent `setupBucket` (create, CORS exposing ETag, public/* read
policy, abort incomplete uploads after a day) with a `storage:setup` script, and
zod-validated `S3_*` config. Run RustFS in compose and CI, add storage to the
API's deps and `/health`, and test against real RustFS.
