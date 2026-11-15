import {lookup as dnsLookup, type LookupAddress} from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import type {LookupFunction} from 'node:net';

import {isPrivateAddress} from './ssrf';

export interface PostResult {
  statusCode: number;
  /** First 1 KB of the response body, for the delivery log. */
  body: string;
}

/**
 * A lookup that refuses private addresses at connect time. Checking the URL
 * before the request isn't enough: DNS can answer differently the second time
 * (DNS rebinding), so the check has to happen on the address actually used.
 */
function guardedLookup(allowPrivate: boolean): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, {...options, all: true}, (err, addresses) => {
      if (err) return callback(err, '', 0);
      const list = addresses as LookupAddress[];
      const bad = !allowPrivate && list.find((a) => isPrivateAddress(a.address));
      if (bad) {
        return callback(new Error(`${hostname} resolves to private address ${bad.address}`), '', 0);
      }
      if (options.all) return callback(null, list as never, 0);
      const first = list[0];
      if (!first) return callback(new Error(`No address for ${hostname}`), '', 0);
      callback(null, first.address, first.family);
    });
  };
}

/** POSTs JSON without following redirects (a redirect could point anywhere). */
export function postJson(
  url: string,
  body: string,
  headers: Record<string, string>,
  {timeoutMs = 10_000, allowPrivate = false}: {timeoutMs?: number; allowPrivate?: boolean} = {},
): Promise<PostResult> {
  const target = new URL(url);
  const client = target.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.request(
      target,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'Vidflow-Webhooks/1.0',
          ...headers,
        },
        lookup: guardedLookup(allowPrivate),
        timeout: timeoutMs,
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          if (text.length < 1024) text += chunk;
        });
        res.on('end', () => resolve({statusCode: res.statusCode ?? 0, body: text.slice(0, 1024)}));
      },
    );
    req.on('timeout', () => req.destroy(new Error(`Timed out after ${timeoutMs} ms`)));
    req.on('error', reject);
    req.end(body);
  });
}
