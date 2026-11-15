# Chapter 12: Architecture

- [Failure paths](architecture/failure-paths.md): retry, stall, dead letter
- [Cancel and delete](architecture/cancel-delete.md): what gets stopped and removed

| Decision                         | Why                                                   |
| -------------------------------- | ----------------------------------------------------- |
| Dead letters as a queue          | Same tools (Bull Board, CLI) as everything else       |
| Cancel = status first, then jobs | Running jobs see the status; queued ones are removed  |
| Delete files before rows         | A crash leaves a row pointing at nothing, not orphans |
| Rate limits in Redis             | Correct across API replicas                           |
| Job scheduler for maintenance    | One schedule, no matter how many replicas             |
| Chaos test with real processes   | Unit tests can't prove recovery from SIGKILL          |
