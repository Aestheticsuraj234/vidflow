# Chapter 9: Architecture

- [Thumbnail job](architecture/thumbnail-job.md): sequence and outputs
- [Sprite and VTT](architecture/sprite-vtt.md): how scrub previews find a tile

| Decision                        | Why                                                    |
| ------------------------------- | ------------------------------------------------------ |
| Separate job, outside the flow  | Cosmetic work never delays or fails playback           |
| Read the source, not renditions | Starts immediately, in parallel with transcoding       |
| One sprite sheet, ≤100 tiles    | One request for every preview; small enough for mobile |
| WebVTT index                    | The format Video.js, Vidstack and JW Player understand |
