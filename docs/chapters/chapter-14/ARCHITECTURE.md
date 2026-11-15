# Chapter 14: Architecture

- [Production topology](architecture/production.md): Compose stack and traffic
- [Autoscaling](architecture/autoscaling.md): the control loop

See also the project-wide [architecture](../../ARCHITECTURE.md) and
[deployment guide](../../DEPLOYMENT.md).

| Decision                      | Why                                                         |
| ----------------------------- | ----------------------------------------------------------- |
| One image per service         | Small, independent deploys; FFmpeg only where needed        |
| Setup as a one-shot service   | Migrations run once, before anything depends on them        |
| R2 by default                 | Free egress; video is all egress                            |
| Caddy hides internal paths    | Metrics and admin reachable only on the private network     |
| Scale on queue depth, not CPU | CPU is always 100% on an encoder; the backlog is the signal |
| Slow scale-down               | Cold encoders cost more than idle ones for a few minutes    |
