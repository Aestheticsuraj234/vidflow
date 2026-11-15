# Chapter 4: Implementation

1. **Shared contract.** `packages/shared/src/video.ts` holds the zod request
   schemas, response types, accepted MIME types and `planParts()`. API and web
   import the same code, so the part size the browser uses always matches the
   server's.
2. **Part plan.** S3 parts are 5 MiB–5 GiB with at most 10,000 per upload.
   `planParts(size)` uses 16 MiB, rounded up to whole MiB when a file is too big
   for 10,000 parts. It is derived from the declared size, so the server never
   stores it and resuming always sees the same plan.
3. **`UploadService`** (API):
   - `create`: check size against `MAX_UPLOAD_BYTES`, insert the video, start a
     multipart upload at `sources/{id}/original.{ext}`, move to `uploading`.
   - `status`: `listParts` from storage. Storage is the source of truth for
     what has arrived, not the client.
   - `signParts`: presign only part numbers inside the plan.
   - `complete`: require every part, complete, then `head` the object. A size
     mismatch deletes it and fails the video. Then move to `uploaded` and call
     `onUploaded` (Chapter 5 enqueues the pipeline there).
   - `abort`: abort the multipart upload and move to `canceled`.
4. **Routes.** `/v1/videos` behind `requireUser`; `parseBody()` turns zod
   errors into `400 validation_failed`. Videos of other users return 404.
5. **Uploader** (`apps/web/src/lib/upload/uploader.ts`): framework-free with an
   injected `UploaderIO`, so it's unit-tested without a browser.
   - Fingerprint `name:size:lastModified` → video ID in localStorage.
   - On start, an existing fingerprint asks the API which parts exist and skips them.
   - Each part is signed right before it's sent, so URLs never expire mid-upload.
   - 4 workers pull from a queue; a failed part retries with exponential backoff.
   - Progress counts finished parts plus bytes in flight (XHR `upload.onprogress`;
     fetch can't report upload progress).
   - Pause aborts the in-flight XHRs and keeps the fingerprint.
6. **Page.** `/upload` and a shared `AppHeader` with navigation.
