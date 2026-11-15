# Chapter 7: Rebuild prompt

In `packages/media` add `runFfmpeg(args, {durationMs, onProgress, signal,
timeoutMs})` (spawn with `-progress pipe:1`, parse blocks, SIGKILL on
abort/timeout, keep stderr tail, `FfmpegError`) and `h264Args(input, output,
target, {gopFrames, preset, threads, inputIsUrl})` (optional audio, lanczos
scale, High/yuv420p, capped VBR, fixed GOP with scene-cut off, AAC 48 kHz,
faststart, reconnect flags). Add `apps/transcode-worker` with a
`transcodeRendition` processor (refuse canceled, reuse finished MP4, temp dir per
job, throttled progress to job/rendition/video with cancel check, upload to
`work/`, record size and time, event, cleanup), `refreshProgress` in the
repository, a stale temp sweep at startup, concurrency 1, 60 s locks, and a
final-failure handler. Add `docker/Dockerfile` with a Node+FFmpeg runtime.
