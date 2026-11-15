import {createHmac, timingSafeEqual} from 'node:crypto';

/**
 * Stripe-style signature: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`.
 * Signing the timestamp with the body lets receivers reject replays.
 */
export function signPayload(secret: string, body: string, timestamp: number): string {
  const mac = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${mac}`;
}

/**
 * What a receiver runs (also used in tests): checks the signature in constant
 * time and that the timestamp is within `toleranceSec` of now.
 */
export function verifySignature(
  secret: string,
  body: string,
  header: string,
  {toleranceSec = 300, now = Date.now()}: {toleranceSec?: number; now?: number} = {},
): boolean {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1) return false;
  if (Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = Buffer.from(signPayload(secret, body, t).split('v1=')[1] ?? '', 'hex');
  const given = Buffer.from(parts.v1, 'hex');
  return expected.length === given.length && timingSafeEqual(expected, given);
}
