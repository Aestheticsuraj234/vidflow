# Chapter 6: Implementation

1. **`probe(input)`** runs `ffprobe -show_format -show_streams -print_format json`
   with a timeout and validates the JSON with zod. It ignores cover-art
   "video" streams, reads rotation from the display matrix (or the old `rotate`
   tag) and swaps width and height for 90°/270°, so phone videos are portrait.
2. **Errors are classified.** `ProbeError.invalidMedia` is true for garbage
   files, missing video and unreadable duration; false for a missing binary,
   timeouts and network errors. The worker turns invalid media into
   `UnrecoverableError` (fail now) and lets the rest retry.
3. **No download.** ffprobe reads a 15-minute presigned GET URL and only fetches
   the bytes it needs.
4. **Ladder.** `planRenditions` takes the default 1080/720/480/360/240 ladder,
   keeps rungs whose short side fits the source (no upscaling), keeps
   orientation and aspect ratio with even dimensions, scales bitrate by pixel
   count (×1.5 above 40 fps), caps it at 1.2× the source bitrate, keeps at most
   four rungs, and makes one source-sized rendition for tiny inputs.
5. **GOP.** `gopFrames(fps)` = 2 s of frames. Every rendition gets the same
   value, so keyframes and HLS segment boundaries line up across qualities.
6. **`probeVideo`** (the processor) is re-runnable:
   - `uploaded` → `probing`; `probing`/`processing` continue; anything else is skipped
   - probe, check duration (`MAX_DURATION_MS`) and minimum size
   - save metadata, insert renditions (unique per name, so a retry inserts nothing) and read them back for IDs
   - `processing` with a summary event, then `startProcessing` (idempotent job IDs)
7. **Final failure.** `onFinalFailure` fires only when no retry is left, and
   `videos.fail()` records the reason on the video and its timeline.
8. **Test kit.** `@vidflow/test-utils` creates users and "uploaded" videos from
   generated fixtures, isolates queues per process and cleans storage after.
