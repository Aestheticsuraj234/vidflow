# Chapter 3: Implementation

1. **Interface first.** `StorageProvider` lists what services need: put, putFile,
   getStream, download, head, delete, deletePrefix, list, presignGet, publicUrl,
   and the five multipart calls. Services depend on the interface, never the SDK.
2. **S3 provider.** `S3StorageProvider` wraps `@aws-sdk/client-s3`. Two settings
   matter: `forcePathStyle` (RustFS/MinIO) and
   `requestChecksumCalculation/responseChecksumValidation: 'WHEN_REQUIRED'`.
   Without the second, presigned part PUTs from the browser fail with 400 on
   RustFS, MinIO and R2 because SDK v3 adds checksum headers by default.
3. **Key layout.** `keys.ts` is the only place keys are built. `publicUrl()`
   refuses anything outside `public/`, so a source file can't leak by mistake.
4. **Bucket setup.** `setupBucket()` is idempotent: create, CORS (web origin may
   PUT and must see `ETag`; anyone may GET), a `public/*` read policy, and
   `AbortIncompleteMultipartUpload` after one day on `sources/`.
5. **Config.** `storageConfigFromEnv()` validates `S3_*` with zod (empty values
   count as unset). The API and every worker call `createStorageFromEnv()`.
6. **Wiring.** `AppDeps` gains `storage`; `/health` reports `checks.storage` and
   returns 503 when either dependency is down. Turbo runs `storage:setup`
   before tests, and passes `S3_*` through to tasks.

## R2 in production

Set `S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`, `S3_REGION=auto`,
`S3_FORCE_PATH_STYLE=false`, `S3_PUBLIC_READ_POLICY=false`, and point
`S3_PUBLIC_BASE_URL` at a custom domain connected to the bucket. R2 has no
bucket policies; the custom domain serves the public files, and since the
domain exposes the whole bucket, route only `public/*` through it with a WAF
or Worker rule (Chapter 14).
