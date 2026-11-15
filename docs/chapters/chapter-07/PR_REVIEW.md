# Chapter 7: Review

| #   | Finding                                                | Fix                                          |
| --- | ------------------------------------------------------ | -------------------------------------------- |
| 1   | Scene-cut keyframes would misalign renditions          | `-sc_threshold 0` with fixed GOP; tested     |
| 2   | Canceled videos kept encoding                          | Status check on progress, `SIGKILL`          |
| 3   | Crashed workers leave GBs in /tmp                      | Per-job temp dir in `finally`, startup sweep |
| 4   | Progress writes every FFmpeg tick would flood Postgres | 2 s throttle, chained writes                 |
| 5   | Video progress could go backwards on retry             | `greatest(progress, …)`                      |
| 6   | Long encodes looked stalled to BullMQ                  | 60 s lock and stalled interval               |
| 7   | Retry re-encoded a finished rendition                  | Reuse when `transcoded` and the MP4 exists   |
| 8   | Stderr of a 2-hour encode held in memory               | Keep the last 8 KB                           |
| 9   | Image is ~1 GB                                         | Documented; static FFmpeg build as an option |
