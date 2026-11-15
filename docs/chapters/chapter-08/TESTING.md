# Chapter 8: Testing

```bash
pnpm --filter @vidflow/media test
pnpm --filter @vidflow/package-worker test   # FFmpeg, Postgres, RustFS, Redis
```

- `packages/media/test/hls.test.ts`: a real 3 s encode segmented into
  `init.mp4` + 2 segments (2 s and 1 s), VOD playlist with `EXT-X-MAP` and
  `ENDLIST`, bandwidth measured, the playlist itself probes as 640×360 with
  audio; playlist parsing; codec strings for High/Main/Baseline; exact master
  playlist text; content types
- `apps/package-worker/test/package-video.test.ts`: two renditions transcoded
  with the real transcode processor, then packaged:
  - video `ready`, 100%, `readyAt`; renditions `packaged` with playlist keys
  - master fetched anonymously: 200, `application/vnd.apple.mpegurl`, `max-age=60`, correct variant line
  - a segment: `video/iso.segment`, `immutable`
  - ffprobe plays the master URL over HTTP
  - `work/` emptied; `notify-{id}-video.ready` queued; "Ready: 2 renditions, 4 segments"
  - already-ready video returns early; canceled refused

Live: both browser uploads from earlier chapters went `ready` as soon as the
package worker started, with the master playlist shown in the README.
