# Chapter 5: Architecture

Queues decouple stages: the API answers in milliseconds, and each stage scales
by adding workers for its own queue.

- [Queues and flow](architecture/queues-and-flow.md): stages, the per-video DAG, who enqueues what
- [Job lifecycle](architecture/job-lifecycle.md): BullMQ states, retries, failure propagation

| Decision                          | Why                                                          |
| --------------------------------- | ------------------------------------------------------------ |
| One queue per stage               | Independent concurrency, scaling and dashboards              |
| BullMQ Flow for transcode→package | The fan-in is enforced by Redis, not by polling Postgres     |
| Deterministic job IDs             | Exactly-once enqueue without a lock                          |
| Thumbnails outside the flow       | Cosmetic work never blocks or fails playback                 |
| zod at the worker boundary        | Bad data fails once, loudly, instead of retrying three times |
