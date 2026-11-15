# Chapter 8: Rebuild prompt

In `packages/media` add `hlsArgs(input, dir)` (fMP4 HLS VOD, 2 s, `-c copy`,
reconnect flags only for HTTP), `parseMediaPlaylist`, `measureBandwidth(dir)`
(peak per segment with a 1 s floor, average), `avcCodec(profile, level)`,
`buildMasterPlaylist(variants)` (version 7, independent segments, best first,
BANDWIDTH/AVERAGE-BANDWIDTH/RESOLUTION/FRAME-RATE/CODECS), `hlsContentType`
and `mapLimit`. Add `apps/package-worker` with `packageVideo` (only from
processing, early return when ready, all renditions transcoded, per-rendition
segmenting, measured bandwidth and probed codecs, uploads with immutable or
60 s cache headers, renditions `packaged`, master playlist, `ready` at 100%,
notify `video.ready`, delete `work/`) and a final-failure handler. Expose
`playbackUrl` in the API and add the worker to the Dockerfile.
