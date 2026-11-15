# Video lifecycle (Chapter 2)

```mermaid
stateDiagram-v2
  [*] --> created: POST /v1/videos
  created --> uploading: multipart started
  created --> uploaded: single-part upload
  uploading --> uploaded: multipart completed
  uploaded --> probing: probe-worker claims it
  probing --> processing: ladder chosen, flow started
  processing --> ready: master playlist published
  probing --> failed
  processing --> failed
  created --> canceled
  uploading --> canceled
  uploaded --> canceled
  probing --> canceled
  processing --> canceled
  ready --> [*]
  failed --> [*]
  canceled --> [*]
```

`VideoRepository.transition(id, to)` is one conditional `UPDATE … WHERE status IN
(allowedFrom(to))`, so two workers can never both move a video, and a late
worker cannot revive a canceled one.
