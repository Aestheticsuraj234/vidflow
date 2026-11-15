# Chapter 6: Architecture

- [Probe stage](architecture/probe-stage.md): sequence and decisions
- [Rendition ladder](architecture/ladder.md): how renditions are chosen

| Decision                     | Why                                                      |
| ---------------------------- | -------------------------------------------------------- |
| Probe from a presigned URL   | No temp disk, ~200 ms, works the same on R2/S3           |
| Separate probe stage         | Bad files fail in seconds, before any expensive encoding |
| Ladder decided once, stored  | Transcode workers just execute; UI knows what's coming   |
| Bad file vs. flaky network   | Only transient errors spend retries                      |
| Same GOP for every rendition | Aligned segments make quality switches seamless          |
