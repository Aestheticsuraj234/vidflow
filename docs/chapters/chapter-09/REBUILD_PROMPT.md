# Chapter 9: Rebuild prompt

In `packages/media` add `posterTimeSec` (10%, ≥1 s, < end), `posterArgs`
(fast seek, `thumbnail=30`, ≤1280 px, JPEG q3), `planSprite` (≤100 tiles,
1 s minimum interval, 160 px tiles keeping aspect, 10 columns), `spriteArgs`
(fps + scale + tile, keyframes only over 10 minutes) and `spriteVtt` (relative
`sprite.jpg#xywh=` cues). Add `apps/thumbnail-worker` with
`generateThumbnails` (refuse canceled/unprobed, poster and sprite in parallel,
upload immutable, upsert `assets` with ffprobe dimensions, event, temp cleanup)
and a final-failure handler that only logs. Add `posterKeys(ids)` and
`posterUrl` to the API, and a Dockerfile target.
