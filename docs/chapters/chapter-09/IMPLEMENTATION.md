# Chapter 9: Implementation

1. **Poster time.** 10% into the video, at least 1 s, never past the end:
   openings are often black or a fade.
2. **Poster frame.** `-ss T` before `-i` (fast seek on the presigned URL), then
   `thumbnail=30` picks the most representative of the next 30 frames, scaled
   to at most 1280 px wide, JPEG quality 3.
3. **Sprite plan.** One tile per second, up to 100 tiles; longer videos spread
   them (a 2-hour film → one every 72 s). Tiles are 160 px wide with the
   video's aspect ratio (portrait tiles stay portrait), 10 per row.
4. **Sprite render.** `fps=1/interval,scale,tile=CxR` in one FFmpeg pass. Over
   10 minutes, `-skip_frame nokey` decodes keyframes only, which is many times
   faster at the cost of tiles snapping to the nearest keyframe.
5. **WebVTT.** One cue per tile: `start --> end` and
   `sprite.jpg#xywh=x,y,w,h`. The URL is relative, so the VTT works wherever
   the folder is served (bucket, CDN, custom domain).
6. **`generateThumbnails`** runs poster and sprite FFmpeg processes in
   parallel, uploads all three files as immutable, records `assets` (upsert by
   key, so retries are harmless) with dimensions from ffprobe, and logs an event.
7. **Isolation.** The thumbnail job sits outside the transcode flow, so its
   failure can't fail the package parent. Its final-failure handler only adds a
   timeline event.
8. **API.** `posterKeys(ids)` loads posters for a whole page in one query;
   `VideoSummary.posterUrl` is null until thumbnails finish.
