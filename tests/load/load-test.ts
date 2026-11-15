/**
 * Load test: uploads COUNT copies of FILE through the public API (the same
 * multipart flow the browser uses), CONCURRENCY at a time, then waits for
 * every video to be ready and reports timings.
 *
 *   API_URL=https://api.example.com FILE=clip.mp4 COUNT=20 CONCURRENCY=5 pnpm load-test
 *
 * Signs up a throwaway user and creates an API key (or set VIDFLOW_API_KEY).
 * Honours 429 Retry-After, so it also shows the rate limits at work.
 */
import {randomUUID} from 'node:crypto';
import {open, stat, writeFile} from 'node:fs/promises';
import {basename} from 'node:path';

import {
  planParts,
  type CreateUploadResponse,
  type SignPartsResponse,
  type VideoSummary,
} from '@vidflow/shared';

const API = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const FILE = process.env.FILE ?? '/tmp/media/sample.mp4';
const COUNT = Number(process.env.COUNT ?? 10);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 4);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 30 * 60_000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function apiKey(): Promise<string> {
  if (process.env.VIDFLOW_API_KEY) return process.env.VIDFLOW_API_KEY;
  const email = `load-${randomUUID()}@load.test`;
  const res = await fetch(`${API}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Origin: WEB},
    body: JSON.stringify({name: 'Load test', email, password: `pw-${randomUUID()}`}),
  });
  if (!res.ok) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const key = await fetch(`${API}/v1/api-keys`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Cookie: cookie, Origin: WEB},
    body: JSON.stringify({name: 'load test'}),
  });
  if (!key.ok) throw new Error(`api key failed: ${key.status} ${await key.text()}`);
  return ((await key.json()) as {key: string}).key;
}

let rateLimited = 0;

/** JSON call that waits out 429s. */
async function call<T>(key: string, path: string, init: RequestInit = {}): Promise<T> {
  for (;;) {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
    if (res.status === 429) {
      rateLimited++;
      await sleep(Number(res.headers.get('retry-after') ?? 5) * 1000);
      continue;
    }
    if (!res.ok)
      throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  }
}

interface Result {
  id: string;
  uploadMs: number;
  readyMs: number;
  status: string;
}

async function uploadOne(key: string, n: number, size: number): Promise<Result> {
  const started = Date.now();
  const {video, upload} = await call<CreateUploadResponse>(key, '/v1/videos', {
    method: 'POST',
    body: JSON.stringify({
      title: `load ${n}`,
      fileName: basename(FILE),
      contentType: 'video/mp4',
      sizeBytes: size,
    }),
  });
  const {partSize, partCount} = planParts(size);
  const numbers = Array.from({length: partCount}, (_, i) => i + 1);
  const {parts} = await call<SignPartsResponse>(key, `/v1/videos/${video.id}/upload/parts`, {
    method: 'POST',
    body: JSON.stringify({partNumbers: numbers}),
  });
  const fh = await open(FILE);
  const etags = [];
  try {
    for (const {partNumber, url} of parts) {
      const length = Math.min(partSize, size - (partNumber - 1) * partSize);
      const buf = Buffer.alloc(length);
      await fh.read(buf, 0, length, (partNumber - 1) * partSize);
      const res = await fetch(url, {method: 'PUT', body: buf});
      if (!res.ok) throw new Error(`part ${partNumber}: ${res.status}`);
      etags.push({partNumber, etag: res.headers.get('etag') ?? ''});
    }
  } finally {
    await fh.close();
  }
  await call(key, `/v1/videos/${video.id}/upload/complete`, {
    method: 'POST',
    body: JSON.stringify({parts: etags}),
  });
  const uploadMs = Date.now() - started;

  for (;;) {
    const v = await call<VideoSummary>(key, `/v1/videos/${video.id}`);
    if (v.status === 'ready' || v.status === 'failed') {
      return {id: video.id, uploadMs, readyMs: Date.now() - started, status: v.status};
    }
    if (Date.now() - started > TIMEOUT_MS)
      return {id: video.id, uploadMs, readyMs: NaN, status: 'timeout'};
    await sleep(1000);
  }
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? NaN;
};
const sec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

const {size} = await stat(FILE);
const key = await apiKey();
console.log(
  `Uploading ${COUNT} × ${basename(FILE)} (${(size / 1e6).toFixed(1)} MB), ${CONCURRENCY} at a time → ${API}`,
);
const t0 = Date.now();
const results: Result[] = [];
let next = 0;
await Promise.all(
  Array.from({length: CONCURRENCY}, async () => {
    while (next < COUNT) {
      const n = next++;
      const r = await uploadOne(key, n, size).catch((err: Error) => ({
        id: '',
        uploadMs: NaN,
        readyMs: NaN,
        status: `error: ${err.message}`,
      }));
      results.push(r);
      console.log(`  #${n} ${r.status} upload ${sec(r.uploadMs)} ready ${sec(r.readyMs)}`);
    }
  }),
);
const wallMs = Date.now() - t0;
const ok = results.filter((r) => r.status === 'ready');
const report = {
  api: API,
  file: basename(FILE),
  sizeBytes: size,
  count: COUNT,
  concurrency: CONCURRENCY,
  ready: ok.length,
  failed: results.length - ok.length,
  rateLimitedResponses: rateLimited,
  wallSeconds: wallMs / 1000,
  videosPerMinute: (ok.length / wallMs) * 60_000,
  uploadSeconds: {
    p50:
      pct(
        ok.map((r) => r.uploadMs),
        50,
      ) / 1000,
    p95:
      pct(
        ok.map((r) => r.uploadMs),
        95,
      ) / 1000,
  },
  timeToReadySeconds: {
    p50:
      pct(
        ok.map((r) => r.readyMs),
        50,
      ) / 1000,
    p95:
      pct(
        ok.map((r) => r.readyMs),
        95,
      ) / 1000,
    max: Math.max(...ok.map((r) => r.readyMs)) / 1000,
  },
};
await writeFile('load-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.failed > 0 ? 1 : 0);
