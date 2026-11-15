# Chapter 3: Review

| #   | Finding                                                  | Fix                                       |
| --- | -------------------------------------------------------- | ----------------------------------------- |
| 1   | Presigned part PUT returned 400 on RustFS                | Checksums `WHEN_REQUIRED`                 |
| 2   | Browser can't read part ETags without CORS exposing them | `ExposeHeaders: ['ETag']`                 |
| 3   | `deletePrefix('work')` would also hit `workshop/…`       | Require a trailing `/`                    |
| 4   | A bug could hand out a URL to a private source           | `publicUrl()` only accepts `public/` keys |
| 5   | Abandoned multipart uploads cost money forever           | Lifecycle abort after 1 day               |
| 6   | Tests would leave buckets behind                         | Delete objects and bucket in `afterAll`   |
| 7   | Turbo's strict env mode hides `S3_*` from tasks          | `globalPassThroughEnv`                    |

MinIO images were unavailable from this environment, so dev uses RustFS. Any
S3-compatible server works; set `S3_ENDPOINT`.
