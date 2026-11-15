# Chapter 14: Review

| #   | Finding                                                              | Fix                                              |
| --- | -------------------------------------------------------------------- | ------------------------------------------------ |
| 1   | Self-hosted presigned uploads pointed at `storage:9000`              | Separate browser presign endpoint                |
| 2   | Web app couldn't see the API's session cookie across subdomains      | `COOKIE_DOMAIN` cross-subdomain cookies          |
| 3   | Production cookies are `Secure`, so an HTTP test stack can't sign in | Local HTTPS via `local_certs`                    |
| 4   | Metrics and Bull Board reachable from the internet                   | Caddy 404s them                                  |
| 5   | An R2 custom domain exposes the whole bucket                         | WAF rule for `/public/` only (DEPLOYMENT.md)     |
| 6   | Redis eviction would silently drop jobs                              | `noeviction` + AOF                               |
| 7   | Deploys killed encodes mid-way                                       | 120 s stop grace; BullMQ finishes the active job |
| 8   | Scaling on CPU is meaningless for encoders                           | Scale on queue depth                             |
| 9   | Flapping replicas on bursty load                                     | Delayed scale-down, cancelled when load returns  |
| 10  | `pnpm setup` runs pnpm's own command                                 | README says `pnpm run setup`                     |
| 11  | Disk filled with build cache during the chapter                      | Pruned; images share the build stage             |

Honest limits: the load test ran on 2 cores; the KEDA manifest is an example
that wasn't applied to a cluster here.
