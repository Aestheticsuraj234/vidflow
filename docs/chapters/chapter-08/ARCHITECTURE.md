# Chapter 8: Architecture

- [Packaging](architecture/packaging.md): sequence and output layout
- [Adaptive streaming](architecture/adaptive-streaming.md): how a player uses it

| Decision                           | Why                                                    |
| ---------------------------------- | ------------------------------------------------------ |
| fMP4 segments                      | Smaller than TS, DASH-compatible, needed for HEVC/AV1  |
| 2 s segments                       | Fast start and quick quality switches; few requests    |
| Measured peak bandwidth            | Players choose qualities they can actually sustain     |
| Immutable segments, 60 s playlists | CDN hit rate near 100% without stale playlists         |
| Public prefix per video            | One rule for CDN and CORS; delete one prefix to remove |
