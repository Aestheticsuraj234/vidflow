# Chapter 2: Rebuild prompt

Add `packages/db` (Drizzle 0.45, snake_case). Schema: Better Auth tables,
`api_keys`, enums `video_status` (created, uploading, uploaded, probing,
processing, ready, failed, canceled), `rendition_status`, `asset_kind`,
`webhook_delivery_status`; tables `videos` (owner, title, status, progress,
error, source key/size/type, upload_id, duration, width, height, fps, codecs,
has_audio, timestamps), `renditions` (unique per video+name; size, bitrates,
status, progress, mp4/playlist keys), `assets` (unique key), `video_events`,
`webhooks`, `webhook_deliveries`. Add a state machine with `allowedFrom(to)`
and `VideoRepository.transition(id, to, patch)` as one conditional update,
plus rendition, asset and event methods. Move Better Auth to the Drizzle
adapter and make `test` depend on `@vidflow/db#db:migrate`.
