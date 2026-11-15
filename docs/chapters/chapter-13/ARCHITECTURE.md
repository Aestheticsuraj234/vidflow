# Chapter 13: Architecture

- [Telemetry flow](architecture/telemetry.md): who exposes what, who scrapes it

| Decision                                | Why                                                     |
| --------------------------------------- | ------------------------------------------------------- |
| Pull metrics (Prometheus)               | Workers stay simple; a dead worker shows as `up == 0`   |
| Queue depth from the API at scrape time | Always current, no exporter to run                      |
| Route patterns as labels                | Bounded cardinality                                     |
| JSON logs to stdout                     | Any collector (Loki, CloudWatch, Datadog) can ship them |
| `/health` = Redis reachable             | The one dependency a worker can't do anything without   |
| Alerts on symptoms (backlog, failures)  | Pages for what users feel, not for every blip           |
