# Bucket layout

```mermaid
flowchart TD
  B[("bucket vidflow")] --> S["sources/{videoId}/original.ext<br/>private · upload"]
  B --> W["work/{videoId}/{rendition}.mp4<br/>private · encoded MP4s"]
  B --> P["public/videos/{videoId}/<br/>public · CDN cacheable"]
  P --> M[master.m3u8 · max-age=60]
  P --> R["{rendition}/index.m3u8, init.mp4, seg_*.m4s<br/>immutable"]
  P --> T[poster.jpg, thumbs/, sprite.jpg, sprite.vtt<br/>immutable]
```

| Rule                        | Where                                                 |
| --------------------------- | ----------------------------------------------------- |
| Anonymous GET on `public/*` | Bucket policy (RustFS/S3) or R2 custom domain         |
| Browser PUT parts, see ETag | CORS rule for `WEB_URL`                               |
| Abandoned uploads removed   | Lifecycle: abort incomplete after 1 day on `sources/` |
| Delete a video              | `keys.allPrefixes(id)` → `deletePrefix` (Chapter 12)  |
