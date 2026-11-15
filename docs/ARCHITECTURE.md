# Vidflow architecture

```mermaid
flowchart TB
  subgraph Clients
    BR["Browser<br/>Next.js app · hls.js player"]
    SV["Your servers<br/>API key"]
    RX["Your webhook receiver"]
  end
  CD["Caddy<br/>HTTPS · app. api. media."]
  subgraph App["Stateless services"]
    WEB["web<br/>Next.js 16"]
    API["api<br/>Hono · Better Auth · SSE · Bull Board"]
    PW["probe-worker"]
    TW["transcode-worker × N<br/>FFmpeg H.264/AAC"]
    KW["package-worker<br/>fMP4 HLS"]
    HW["thumbnail-worker<br/>poster · sprite · VTT"]
    NW["notify-worker<br/>webhooks · maintenance"]
  end
  subgraph Data
    PG[("Postgres<br/>videos · renditions · assets · events<br/>webhooks · deliveries · API keys")]
    RD[("Redis<br/>BullMQ · pub/sub · rate limits")]
    S3[("Object storage<br/>R2 / S3 / RustFS")]
  end
  CDN["CDN / custom domain"]

  BR --> CD --> WEB
  CD --> API
  SV --> API
  BR -- "presigned part PUTs" --> S3
  BR -- "HLS, posters, sprites" --> CDN --> S3
  API --> PG & RD
  API -- "create/complete multipart, presign" --> S3
  RD --> PW & TW & KW & HW & NW
  PW & TW & KW & HW --> S3
  PW & TW & KW & HW & NW --> PG
  NW -- "signed POST" --> RX
```

## A video's journey

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant A as API
  participant S as Storage
  participant Q as Redis (BullMQ)
  participant P as probe
  participant T as transcode ×N
  participant K as package
  participant H as thumbnail
  participant N as notify
  B->>A: POST /v1/videos
  A->>S: CreateMultipartUpload
  B->>S: PUT parts (presigned, resumable)
  B->>A: complete → uploaded
  A->>Q: probe-{id} · notify video.uploaded
  Q->>P: probe
  P->>S: ffprobe presigned URL
  P->>Q: Flow: package ← transcode×N, + thumbnail · notify video.processing
  par each rendition
    Q->>T: transcode 1080p/720p/…
    T->>S: work/{id}/{r}.mp4
  and
    Q->>H: thumbnail
    H->>S: poster.jpg, sprite.jpg, sprite.vtt
  end
  Q->>K: package (all children done)
  K->>S: public/videos/{id}/…/*.m4s + master.m3u8
  K->>Q: notify video.ready
  Q->>N: fan out → deliver (signed, retried)
  Note over A,B: every status/progress change → Redis pub/sub → SSE → browser
```

## Video states

```mermaid
stateDiagram-v2
  [*] --> created
  created --> uploading
  uploading --> uploaded: parts complete, size verified
  uploaded --> probing
  probing --> processing: ladder chosen, flow started
  processing --> ready: HLS published
  uploading --> canceled
  uploaded --> canceled
  probing --> canceled
  processing --> canceled
  uploading --> failed
  probing --> failed: not a video / too long
  processing --> failed: rendition failed for good
  ready --> [*]
  failed --> [*]
  canceled --> [*]
```

## Packages

| Package                   | What it holds                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `@vidflow/shared`         | Types and zod schemas shared by API and web; `planParts()`                                                             |
| `@vidflow/db`             | Drizzle schema, migrations, video state machine, repositories                                                          |
| `@vidflow/storage`        | `StorageProvider`, S3 implementation, key layout, bucket setup                                                         |
| `@vidflow/queues`         | Queue contracts, `Pipeline` (flows, cancel, dead letters), typed workers, live pub/sub, rate limiter, autoscale policy |
| `@vidflow/media`          | ffprobe, FFmpeg runner, H.264 args, ladder, HLS, thumbnails                                                            |
| `@vidflow/observability`  | pino logger, Prometheus metrics, worker instrumentation                                                                |
| `@vidflow/worker-runtime` | Wiring shared by media workers                                                                                         |
| `@vidflow/test-utils`     | Real-infrastructure test context, video fixtures                                                                       |

## Key decisions

| Decision                                | Why                                                  | Chapter |
| --------------------------------------- | ---------------------------------------------------- | ------- |
| Bytes never pass through the API        | Presigned uploads in, CDN out; the API stays small   | 3, 4    |
| One queue per stage                     | Each stage scales and fails on its own               | 5       |
| BullMQ Flow for transcode → package     | Fan-in enforced by Redis, not by polling             | 5       |
| Deterministic job IDs                   | Exactly-once enqueue without locks                   | 5       |
| Probe before encoding                   | Bad files fail in seconds; ladder never upscales     | 6       |
| Fixed 2 s GOP, scene-cut off            | Segments align across renditions: seamless switching | 7, 8    |
| Encode MP4, then segment with `-c copy` | Packaging retries never re-encode                    | 8       |
| Measured `BANDWIDTH`, probed `CODECS`   | Players choose qualities they can actually play      | 8       |
| Thumbnails outside the flow             | Cosmetic work never blocks playback                  | 9       |
| Repository change hook → pub/sub → SSE  | Live UI without polling; one place to publish        | 10      |
| Webhook delivery = its own job          | Per-endpoint retries; SSRF guard at connect time     | 10      |
| Dead letters + stall detection          | Nothing fails silently; dead workers' jobs recover   | 12      |
| Queue depth as a metric                 | Drives alerts, dashboards and autoscaling            | 13, 14  |
