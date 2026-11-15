# Chapter 2: Architecture

Diagrams: [data model](architecture/data-model.md) · [video lifecycle](architecture/video-lifecycle.md)

```
packages/db/
├── drizzle/0000_initial-schema.sql
├── src/schema/      auth, api-keys, enums, videos, webhooks
├── src/repositories/ video-repository.ts, api-key-repository.ts
├── src/video-state.ts
└── test/            videos.test.ts, api-keys.test.ts
```

| Who              | Uses                                                      |
| ---------------- | --------------------------------------------------------- |
| api              | create videos, read status, timelines                     |
| probe-worker     | `transition(uploaded → probing → processing)`, renditions |
| transcode-worker | rendition status and progress                             |
| package-worker   | `transition(processing → ready)`                          |
| thumbnail-worker | assets                                                    |
| notify-worker    | webhook deliveries                                        |
