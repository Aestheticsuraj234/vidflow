# Chapter 4: Architecture

The API is a coordinator: it decides where bytes go and checks they arrived,
but the bytes themselves travel browser → bucket.

- [Upload sequence](architecture/upload-sequence.md): create, sign, PUT, resume, complete
- [Uploader internals](architecture/uploader.md): queue, workers, retries, progress

| Decision                               | Why                                                      |
| -------------------------------------- | -------------------------------------------------------- |
| S3 multipart, not tus                  | Native to S3/R2; no upload server to run                 |
| Storage decides what's uploaded        | `listParts` can't be faked or go stale like client state |
| Sign per part, just in time            | Uploads of any length never hit URL expiry               |
| Part size derived from file size       | No extra column; resume always matches                   |
| Verify size with `HEAD` after complete | The declared size feeds quotas and the pipeline          |
