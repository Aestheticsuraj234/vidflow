# Chapter 3: Architecture

Storage is shared infrastructure. The browser uploads straight to the bucket
with presigned URLs, workers read sources and write outputs, and players fetch
public files from the bucket or a CDN. The API never proxies video bytes.

- [Storage layer](architecture/storage-layer.md): the interface, provider and who uses it
- [Bucket layout](architecture/bucket-layout.md): prefixes, visibility, cache headers, lifecycle

Decisions:

| Decision                 | Why                                                               |
| ------------------------ | ----------------------------------------------------------------- |
| S3 API, not a filesystem | Workers scale across machines; R2/S3 in prod, RustFS in dev       |
| Strategy interface       | Swap providers or fake storage in tests without touching services |
| Public prefix, not ACLs  | One rule to reason about; works with a CDN in front               |
| Presigned URLs           | Video bytes bypass the API, which stays small and fast            |
