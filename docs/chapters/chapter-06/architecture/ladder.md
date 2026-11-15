# Rendition ladder

```mermaid
flowchart TD
  S["source: width × height, fps, bitrate"] --> O{portrait?}
  O --> F["short side = min(w, h)"]
  F --> K["keep rungs ≤ short side<br/>(1080, 720, 480, 360, 240), max 4"]
  K --> N{any left?}
  N -- no --> One["one rendition at source size"]
  N -- yes --> D["long side = short × aspect, rounded to even"]
  D --> B["bitrate × pixels/16:9 × 1.5 if > 40 fps<br/>capped at 1.2 × source"]
```

| Source    | Renditions                            |
| --------- | ------------------------------------- |
| 3840×2160 | 1080p, 720p, 480p, 360p               |
| 1280×720  | 720p, 480p, 360p, 240p                |
| 1080×1920 | 1080×1920, 720×1280, 480×854, 360×640 |
| 176×144   | 144p (176×144)                        |
