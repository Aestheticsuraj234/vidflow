# Chapter 7: Architecture

- [Transcode job](architecture/transcode-job.md): sequence, progress and cancel
- [Encoding settings](architecture/encoding.md): why each FFmpeg flag is there

| Decision                       | Why                                                 |
| ------------------------------ | --------------------------------------------------- |
| One job per rendition          | Renditions encode in parallel on different machines |
| Read source from presigned URL | No download step, no source copy on disk            |
| MP4 to `work/`, segment later  | Encoding and packaging retry independently          |
| Concurrency 1, scale out       | x264 saturates cores; two encodes just fight        |
| Cancel checked during progress | A canceled 2-hour film stops within seconds         |
