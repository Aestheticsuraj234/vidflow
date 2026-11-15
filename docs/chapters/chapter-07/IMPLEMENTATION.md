# Chapter 7: Implementation

1. **`runFfmpeg(args, options)`** spawns FFmpeg with `-nostats -progress pipe:1`.
   Stdout arrives as `key=value` blocks ending in `progress=…`; each block
   becomes `{outTimeMs, percent, speed, fps}`. Percent stays ≤ 99 until
   `progress=end`. Stderr keeps only the last 8 KB. Abort and timeout send
   `SIGKILL`; a missing binary says so.
2. **`h264Args`** builds one rendition:
   - `-map 0:v:0 -map 0:a:0?` (audio optional), `-an` for silent renditions
   - `scale=W:H:flags=lanczos,setsar=1` (FFmpeg auto-rotates first)
   - libx264 High, `yuv420p`, capped VBR (`maxrate` +7%, `bufsize` 1.5×)
   - `-g N -keyint_min N -sc_threshold 0`: keyframes exactly every 2 s in every rendition
   - AAC stereo 48 kHz, `+faststart`
   - HTTP input with reconnect flags, since the source is a presigned URL
3. **`transcodeRendition`**:
   - refuses canceled/failed videos with `UnrecoverableError`
   - if the rendition is already `transcoded` and its MP4 exists, returns it (retry after upload)
   - encodes into `mkdtemp(TRANSCODE_TMP_DIR/vidflow-transcode-…)`
   - every 2 s: `job.updateProgress`, rendition progress, `refreshProgress` (one SQL
     update: 5 + 80% × average rendition progress, never decreasing), and a status
     check that aborts FFmpeg if the video was canceled. Reports are chained so
     a slow database can't pile them up.
   - uploads the MP4 to `work/`, stores size and encode time, logs
     "720p encoded in 5.0s, 7.0 MB (4.0× realtime)"
   - `finally` removes the temp folder
4. **Worker settings.** Concurrency 1 by default (x264 already uses all cores;
   scale with processes or pods). `lockDuration`/`stalledInterval` 60 s for long
   CPU-bound jobs. A job left by a killed worker becomes stalled and is retried.
5. **Final failure** marks the rendition and the video failed.
6. **Image.** `media-runtime` = `node:22-slim` + Debian FFmpeg (libx264 checked at
   build time). It is ~1 GB because Debian's FFmpeg pulls in many libraries; a
   static FFmpeg build cuts that to ~250 MB if image size matters.
