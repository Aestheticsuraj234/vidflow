# Chapter 13: Review

| #   | Finding                                                     | Fix                                    |
| --- | ----------------------------------------------------------- | -------------------------------------- |
| 1   | Raw paths as labels would create a series per video         | Route patterns                         |
| 2   | A queue-depth exporter would be one more thing to run       | Gauge with `collect()` in the API      |
| 3   | Webhook secrets or cookies could end up in logs             | pino `redact`                          |
| 4   | "Failed" counted retries as failures                        | `retried` vs `failed` (final) outcomes |
| 5   | `/metrics` on the public API port                           | Optional `METRICS_TOKEN`               |
| 6   | `increase()` showed 2.30 videos                             | `round()` in stat panels               |
| 7   | Empty panels read as "No data" rather than zero             | `or vector(0)`                         |
| 8   | Restart helper piped into `tail` hung on background servers | Don't pipe it                          |
