# Chapter 8: HLS packaging and adaptive streaming

**Goal:** turn the encoded MP4s into adaptive HLS any player can stream: fMP4
segments per rendition, a master playlist with real bandwidths and codec
strings, public CDN-friendly paths and cache headers. Then mark the video ready.

## What you get

- `packages/media`: `hlsArgs()` (segment with `-c copy`), `parseMediaPlaylist()`,
  `measureBandwidth()` (peak and average from the actual segments), `avcCodec()`,
  `buildMasterPlaylist()`, `hlsContentType()`, `mapLimit()`
- `apps/package-worker`: the flow's parent job → `public/videos/{id}/…`, status `ready`, `video.ready` notify job
- Segments and init `immutable` for a year, playlists 60 s
- Intermediate MP4s deleted after packaging (`KEEP_RENDITION_MP4=true` keeps them)
- `playbackUrl` on every video response once ready

```
#EXT-X-STREAM-INF:BANDWIDTH=2972028,AVERAGE-BANDWIDTH=2943531,RESOLUTION=1280x720,FRAME-RATE=30.000,CODECS="avc1.64001f,mp4a.40.2"
720p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1572016,AVERAGE-BANDWIDTH=1508473,RESOLUTION=854x480,FRAME-RATE=30.000,CODECS="avc1.64001f,mp4a.40.2"
480p/index.m3u8
…
```

[IMPLEMENTATION](IMPLEMENTATION.md) · [ARCHITECTURE](ARCHITECTURE.md) ·
[TESTING](TESTING.md) · [PR_REVIEW](PR_REVIEW.md) · [REBUILD_PROMPT](REBUILD_PROMPT.md)

**Next:** Chapter 9, thumbnails and preview sprites.
