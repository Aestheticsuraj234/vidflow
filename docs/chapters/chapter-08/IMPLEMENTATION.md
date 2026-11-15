# Chapter 8: Implementation

1. **Why encode and package separately.** Transcoding is expensive and runs in
   parallel per rendition; packaging is cheap (`-c copy`) and needs all of them.
   Splitting them means a failed upload of segments never costs a re-encode,
   and the same MP4s could be repackaged as DASH later.
2. **Segmenting.** `ffmpeg -c copy -f hls -hls_segment_type fmp4 -hls_time 2
-hls_playlist_type vod`. HLS can only cut at keyframes; Chapter 7 put one
   exactly every 2 s in every rendition, so segment N covers the same seconds in
   every quality and players switch without glitches.
3. **fMP4, not MPEG-TS.** One `init.mp4` plus `.m4s` segments: smaller, the
   same files work for DASH, and required for HEVC/AV1 later.
4. **Honest bandwidth.** `BANDWIDTH` must be the peak bitrate of any segment, or
   players pick a quality they can't sustain. `measureBandwidth` reads every
   segment size and duration (very short final segments count as 1 s).
5. **Codec strings from the output.** The worker probes the packaged playlist
   and builds `avc1.PPCCLL` from the real profile and level: x264 picks the
   level per resolution (3.1 for 720p, 2.1 for 240p), and at fast presets it may
   even emit Constrained Baseline. `mp4a.40.2` only when there is audio.
6. **`packageVideo`**: refuses non-processing videos, returns early if already
   ready, packages each rendition in its own temp folder, uploads with 8
   parallel PUTs, marks renditions `packaged`, writes the master, moves to
   `ready` (progress 85 → 95 → 100), logs, queues `video.ready`, deletes `work/`.
7. **Failure.** `onFinalFailure` on the package worker also catches BullMQ 6's
   deferred child failure; `videos.fail()` is a no-op if the transcode worker
   already failed the video.
8. **API.** `VideoSummary.playbackUrl` = public URL of the master playlist when ready.
