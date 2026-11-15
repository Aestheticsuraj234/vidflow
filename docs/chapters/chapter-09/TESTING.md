# Chapter 9: Testing

```bash
pnpm --filter @vidflow/media test
pnpm --filter @vidflow/thumbnail-worker test
```

- `packages/media/test/thumbnails.test.ts` (7): poster time rules; poster JPEG
  640×360 with a 640 limit; sprite plans for short, 2-hour and portrait videos;
  a real 3-tile 480×90 sprite; VTT cues including row wrap and a short last cue
- `apps/thumbnail-worker/test/generate-thumbnails.test.ts` (4): poster, sprite and
  VTT published and readable anonymously with the right content types, assets
  with dimensions, event text, temp dir cleaned; running twice keeps 3 assets;
  portrait poster 720×1280; unprobed and canceled videos refused
- `apps/api/test/uploads.test.ts`: `posterUrl` in the single and list responses

Live: thumbnail jobs for the earlier uploads finished in about 4 s each; the
sprite above is the real output.
