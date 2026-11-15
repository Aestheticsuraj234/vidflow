# Chapter 9: Review

| #   | Finding                                            | Fix                                          |
| --- | -------------------------------------------------- | -------------------------------------------- |
| 1   | First-frame posters are often black                | 10% in plus the `thumbnail` filter           |
| 2   | Decoding a 2-hour film for 100 tiles is slow       | Keyframes only above 10 minutes              |
| 3   | Portrait videos produced stretched tiles           | Tile height from aspect ratio                |
| 4   | Absolute URLs in the VTT break behind a CDN domain | Relative `sprite.jpg#xywh=…`                 |
| 5   | Listing videos would query assets per video        | `posterKeys(ids)` in one query               |
| 6   | A broken poster would fail the whole video         | Outside the flow; failure only logs an event |
