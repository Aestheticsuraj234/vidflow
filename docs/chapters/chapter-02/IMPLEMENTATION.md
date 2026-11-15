# Chapter 2: Implementation notes

## Acceptance criteria

| #   | Criterion                                                           | Result |
| --- | ------------------------------------------------------------------- | ------ |
| 1   | Migration creates every table on an empty database                  | ✅     |
| 2   | Illegal transitions (skip a stage, leave a final state) are refused | ✅     |
| 3   | Two concurrent moves to `probing`: exactly one wins                 | ✅     |
| 4   | A canceled video cannot be moved on by a late worker                | ✅     |
| 5   | Renditions are unique per video and name; assets unique per key     | ✅     |
| 6   | Deleting a video removes its renditions and assets                  | ✅     |
| 7   | Auth still works through the Drizzle adapter (browser flow)         | ✅     |

## Decisions

- **Status on the row, moves in SQL.** `transition()` is a single
  conditional update; no locks, no read-then-write race. Every worker in later
  chapters starts with it.
- **Renditions are rows, not JSON.** Each has its own status and progress,
  because each is encoded by a different worker, possibly on another machine.
- **Storage keys, not URLs.** URLs depend on the environment (RustFS, R2, a
  CDN); keys do not.
- **`video_events`** gives the dashboard a human-readable timeline without
  digging through BullMQ.
