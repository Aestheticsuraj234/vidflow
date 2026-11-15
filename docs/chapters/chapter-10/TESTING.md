# Chapter 10: Testing

```bash
pnpm --filter @vidflow/queues test         # live publisher + hub
pnpm --filter @vidflow/notify-worker test  # signing, SSRF, fan-out, delivery
pnpm --filter @vidflow/api test            # webhooks API, SSE stream
```

- `packages/queues/test/live.test.ts`: owner-only delivery; 20 writes + 2 events
  → 2 messages carrying the latest progress; 3 tabs share one subscription and
  clean up
- `apps/notify-worker/test/signature.test.ts`: genuine signature; changed body,
  wrong secret, old timestamp, garbage header rejected; 12 address cases
- `apps/notify-worker/test/notify.test.ts` (real HTTP receiver): one delivery per
  subscribed endpoint and none on retry; signed POST verified by the receiver
  with the payload shape, logged as delivered, duplicate job doesn't re-send;
  503 → pending and retried, 400 → failed for good; private address refused;
  connection refused logged and retryable
- `apps/api/test/webhooks.test.ts`: secret shown once, validation, pause, test
  ping queued, delivery log, delete, other users get 404
- `apps/api/test/live.test.ts`: 401 without a session; SSE `ready` then a
  `video` message; the hub is empty after the client disconnects

## Live

With a local receiver on :4545 and `WEBHOOK_ALLOW_PRIVATE=true`, a browser
upload changed from `uploaded` to `processing` to `ready` on screen without a
reload, and the receiver got `video.uploaded`, `video.processing` and
`video.ready`, each signed. A test ping showed up in the delivery log as
delivered with 200.

## Verifying in your receiver (Node)

```ts
import {createHmac, timingSafeEqual} from 'node:crypto';

function verify(secret: string, rawBody: string, header: string): boolean {
  const {t, v1} = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  const given = Buffer.from(v1 ?? '', 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
```
