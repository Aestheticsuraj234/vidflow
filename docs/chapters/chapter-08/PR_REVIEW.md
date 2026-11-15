# Chapter 8: Review

| #   | Finding                                               | Fix                                                      |
| --- | ----------------------------------------------------- | -------------------------------------------------------- |
| 1   | `BANDWIDTH` from the target bitrate understates peaks | Measure segments                                         |
| 2   | Hard-coded `avc1.640028` lies about level and profile | Probe the output; fast presets emit Constrained Baseline |
| 3   | A 0.2 s last segment produced an absurd peak          | Count segments as at least 1 s                           |
| 4   | `-reconnect` flags break local file inputs            | Only for `http(s)` inputs                                |
| 5   | Retrying a ready video's package job redid everything | Early return when `ready`                                |
| 6   | Work MP4s doubled storage                             | Deleted after ready, opt-out flag                        |
| 7   | Restart helper's `pkill -f` matched the calling shell | Anchored pattern                                         |

Not yet: a browser player (Chapter 11) and signed/private playback (out of scope; see the R2 note in Chapter 3).
