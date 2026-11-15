# Chapter 10: Review

| #   | Finding                                                    | Fix                                                    |
| --- | ---------------------------------------------------------- | ------------------------------------------------------ |
| 1   | Publishing from each worker would be forgotten somewhere   | Repository `onChange` hook                             |
| 2   | Progress writes every 2 s × 4 renditions flood the browser | 250 ms coalescing per video; events kept               |
| 3   | A Redis connection per SSE client doesn't scale            | One subscriber per process, in-memory fan-out          |
| 4   | Proxies close idle streams                                 | 15 s heartbeat, `X-Accel-Buffering: no`                |
| 5   | Webhook URLs could reach internal services / metadata      | Private-address check inside the socket lookup         |
| 6   | Checking DNS before the request is vulnerable to rebinding | Same lookup used for the connection                    |
| 7   | Redirects could bounce to internal hosts                   | Not followed                                           |
| 8   | Retried notify jobs would send duplicates                  | Unique (webhook, video, event) + `onConflictDoNothing` |
| 9   | Retrying 400s forever wastes everyone's time               | Only 408/409/425/429/5xx and network errors retry      |
| 10  | Replayed requests could be accepted by receivers           | Timestamp inside the signed string                     |
| 11  | Secrets listed in API responses                            | Shown once; afterwards only a hint                     |
| 12  | Same wiring copied into five workers                       | `@vidflow/worker-runtime`                              |
| 13  | e2e clicked the email address for "Test"                   | `button:has-text("Test")`                              |
