# Chapter 6: Rebuild prompt

Add `packages/media` with `probe(input)` (ffprobe JSON validated by zod, ignores
cover art, applies rotation, returns duration/size/fps/codecs/bitrate/audio),
`ProbeError` with `invalidMedia`, `planRenditions(info)` (1080–240 ladder, no
upscaling, max 4, aspect and orientation kept, even sizes, bitrate scaled by
pixels and fps and capped at 1.2× source, one rung for tiny inputs) and
`gopFrames(fps)` (2 s), plus generated test fixtures. Add `apps/probe-worker`:
a re-runnable `probeVideo` processor (uploaded→probing, probe a presigned URL,
reject invalid/too long/too small with `UnrecoverableError`, save metadata and
renditions, →processing with a summary event, start the Flow), `onFinalFailure`
→ `videos.fail()`, env with concurrency and max duration, graceful shutdown.
Add `@vidflow/test-utils` and FFmpeg in CI.
