# Chapter 10: Architecture

- [Live updates](architecture/live-updates.md): from a database write to the browser
- [Webhooks](architecture/webhooks.md): fan-out, delivery, retries, signing

| Decision                         | Why                                                    |
| -------------------------------- | ------------------------------------------------------ |
| Publish from the repository hook | Impossible to forget; one place to throttle            |
| Redis pub/sub, channel per user  | Any API instance can serve any user's stream           |
| One subscriber per process       | Connections scale with API pods, not with browsers     |
| SSE over WebSockets              | One-way, plain HTTP, auto-reconnect, cookies just work |
| Delivery = its own job           | Per-endpoint retries; one dead receiver blocks nothing |
| Unique (webhook, video, event)   | Exactly-once logging even when jobs retry              |
| SSRF check at connect time       | Survives DNS rebinding                                 |
