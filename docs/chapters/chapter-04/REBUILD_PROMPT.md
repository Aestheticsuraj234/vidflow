# Chapter 4: Rebuild prompt

In `@vidflow/shared` add accepted video MIME types, `planParts(size)` (16 MiB
parts, ≥5 MiB, ≤10,000 parts) and zod schemas for create, sign parts and
complete. In the API add `UploadService` (create video + multipart upload →
`uploading`; status via ListParts; sign only valid part numbers; complete
requires all parts, HEADs the object, fails on size mismatch, moves to
`uploaded` and calls an `onUploaded` hook; abort → `canceled`) and `/v1/videos`
routes with `parseBody` validation and per-user scoping. In the web app add a
framework-free `uploadFile(file, io, options)` with fingerprint resume, 4
parallel parts, per-part signing, retries with backoff and XHR progress, and an
`/upload` page with drag and drop, progress, speed, ETA, pause, resume, cancel
and recent uploads. Test with real Postgres/RustFS and a fake IO.
