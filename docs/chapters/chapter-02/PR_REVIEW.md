# Chapter 2: Review

| #   | Finding                                                | Fix                                              |
| --- | ------------------------------------------------------ | ------------------------------------------------ |
| 1   | A worker reading status then writing it could race     | `transition()` as one conditional `UPDATE`       |
| 2   | Re-running a probe would duplicate renditions          | Unique `(video_id, name)`, `onConflictDoNothing` |
| 3   | Re-running thumbnails would duplicate assets           | Unique `key`, upsert                             |
| 4   | Chapter 1's camelCase auth tables clash with Drizzle's | One-time dev reset, documented                   |

Style: no `any`; repository methods return typed rows; enums exported as types.
