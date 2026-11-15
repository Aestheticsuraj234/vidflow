# Chapter 3: Testing

```bash
docker compose up -d storage
pnpm storage:setup
pnpm --filter @vidflow/storage test
```

`packages/storage/test/storage.test.ts` runs against real RustFS in a
throwaway bucket (`vidflow-test-<pid>`), deleted afterwards:

- put/head/getText, missing objects return `null`
- putFile/download round trip of a 200 KB file
- `public/*` readable anonymously (200), `work/*` refused (403), `publicUrl` rejects private keys
- presigned GET works
- browser-style multipart: presigned part PUTs with an `Origin` header, CORS exposes `ETag`, `listParts`, complete with parts out of order
- abort, list and `deletePrefix`

API: `/health` reports `storage: ok`, and 503 when storage is unreachable.
