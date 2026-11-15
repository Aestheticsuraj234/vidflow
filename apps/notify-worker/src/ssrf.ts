import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';

/** Loopback, private, link-local (cloud metadata!), CGNAT and unique-local ranges. */
export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const a = address.toLowerCase();
    if (a === '::1' || a === '::') return true;
    if (a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe80')) return true;
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateAddress(mapped[1] ?? '') : false;
  }
  const [a = 0, b = 0] = address.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

/**
 * Webhook URLs are user input: without this, anyone could make the worker
 * call internal services or the cloud metadata endpoint (169.254.169.254).
 * Resolves the host and refuses private addresses unless explicitly allowed
 * (local development).
 */
export async function assertPublicUrl(url: string, allowPrivate: boolean): Promise<void> {
  const {hostname, protocol} = new URL(url);
  if (protocol !== 'https:' && protocol !== 'http:') throw new Error('Only http(s) URLs');
  if (allowPrivate) return;
  const host = hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{address: host}] : await lookup(host, {all: true});
  for (const {address} of addresses) {
    if (isPrivateAddress(address)) throw new Error(`${hostname} resolves to a private address`);
  }
}
