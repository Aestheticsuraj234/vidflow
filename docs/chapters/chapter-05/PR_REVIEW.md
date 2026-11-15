# Chapter 5: Review

| #   | Finding                                                     | Fix                                                 |
| --- | ----------------------------------------------------------- | --------------------------------------------------- |
| 1   | Double-clicking "complete" could start two pipelines        | Deterministic job IDs                               |
| 2   | `transcode:{id}:720p` throws in BullMQ 6                    | `-` separators                                      |
| 3   | Expected the parent to fail at once when a child fails      | BullMQ 6 defers it to pickup; documented and tested |
| 4   | Bad job data would be retried 3 times                       | `UnrecoverableError` after zod validation           |
| 5   | `/health` hung when Redis was down                          | 1 s timeout race                                    |
| 6   | Unhandled `error` events on lost Redis connections          | `onError` listener on queues and the flow producer  |
| 7   | Tests could collide with dev queues                         | Per-process prefix and `obliterate` after each test |
| 8   | A thumbnail failure would block playback if it were a child | Thumbnail job lives outside the flow                |
