# Chapter 12: Review

| #   | Finding                                                      | Fix                                                       |
| --- | ------------------------------------------------------------ | --------------------------------------------------------- |
| 1   | Jobs failed for good vanished after 7 days with no way back  | Dead-letter copy + replay                                 |
| 2   | 60 s locks mean a minute before a dead worker's job recovers | Configurable; trade-off documented                        |
| 3   | A job that OOM-kills every worker would loop forever         | `maxStalledCount: 2`                                      |
| 4   | Removing a child before its parent left a dangling parent    | Remove the parent with `removeChildren`                   |
| 5   | A job can turn active between the state check and `remove()` | Catch; the job sees the canceled status                   |
| 6   | Deleting a video left gigabytes in the bucket                | All three prefixes deleted first                          |
| 7   | In-memory rate limits break with two API replicas            | Redis counter                                             |
| 8   | One user could fill every transcode worker                   | `MAX_ACTIVE_VIDEOS`                                       |
| 9   | `setInterval` maintenance would run once per replica         | BullMQ job scheduler                                      |
| 10  | Chaos test counted every job as "recovered"                  | `attemptsMade` includes the success; use `stalledCounter` |
