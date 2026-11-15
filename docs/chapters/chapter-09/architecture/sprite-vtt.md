# Sprite and VTT

```mermaid
flowchart LR
  H["hover at 12.4 s"] --> V["sprite.vtt: cue 00:12.000 → 00:13.000"]
  V --> X["sprite.jpg#xywh=320,90,160,90"]
  X --> T["crop that tile from the one sprite image"]
```

| Video length | Interval | Tiles | Grid  |
| ------------ | -------- | ----- | ----- |
| 20 s         | 1 s      | 20    | 10×2  |
| 10 min       | 6 s      | 100   | 10×10 |
| 2 h          | 72 s     | 100   | 10×10 |
