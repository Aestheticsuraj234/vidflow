import type {CreatedApiKey, CreateUploadResponse, VideoDetail} from '@vidflow/shared';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {ADMIN_EMAIL, makeTestApp, signUp} from './helpers';

const t = makeTestApp();
let session: Record<string, string>;
beforeAll(async () => {
  session = await signUp(t.app);
});
afterAll(() => t.close());

const bearer = (key: string) => ({
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
});

async function createKey(): Promise<CreatedApiKey> {
  const res = await t.app.request('/v1/api-keys', {
    method: 'POST',
    headers: session,
    body: JSON.stringify({name: 'CI'}),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as CreatedApiKey;
}

describe('API keys', () => {
  it('lets a server create uploads with a key', async () => {
    const key = await createKey();
    expect(key.key).toMatch(/^vf_/);
    expect(key.key.startsWith(key.prefix)).toBe(true);

    const res = await t.app.request('/v1/videos', {
      method: 'POST',
      headers: bearer(key.key),
      body: JSON.stringify({
        title: 'From CI',
        fileName: 'a.mp4',
        contentType: 'video/mp4',
        sizeBytes: 100,
      }),
    });
    expect(res.status).toBe(201);
    const {video} = (await res.json()) as CreateUploadResponse;

    // The same user sees it in the browser.
    const detail = (await (
      await t.app.request(`/v1/videos/${video.id}`, {headers: session})
    ).json()) as VideoDetail;
    expect(detail).toMatchObject({title: 'From CI', renditions: [], previewsUrl: null});
    expect(detail.events.map((e) => e.message)).toEqual(['Upload started']);

    const list = (await (await t.app.request('/v1/api-keys', {headers: session})).json()) as {
      apiKeys: {id: string}[];
    };
    expect(list.apiKeys.map((k) => k.id)).toContain(key.id);
    expect(JSON.stringify(list)).not.toContain(key.key);
  });

  it('refuses revoked and made-up keys', async () => {
    const key = await createKey();
    expect(
      (await t.app.request(`/v1/api-keys/${key.id}`, {method: 'DELETE', headers: session})).status,
    ).toBe(204);
    expect((await t.app.request('/v1/videos', {headers: bearer(key.key)})).status).toBe(401);
    expect((await t.app.request('/v1/videos', {headers: bearer('vf_nope')})).status).toBe(401);
  });

  it("can't manage keys or webhooks with a key", async () => {
    const key = await createKey();
    expect((await t.app.request('/v1/api-keys', {headers: bearer(key.key)})).status).toBe(401);
    expect((await t.app.request('/v1/webhooks', {headers: bearer(key.key)})).status).toBe(401);
  });

  it("can't revoke someone else's key", async () => {
    const key = await createKey();
    const other = await signUp(t.app);
    expect(
      (await t.app.request(`/v1/api-keys/${key.id}`, {method: 'DELETE', headers: other})).status,
    ).toBe(404);
  });
});

describe('Bull Board', () => {
  it('is hidden from non-admins', async () => {
    expect((await t.app.request('/admin/queues')).status).toBe(404);
    expect((await t.app.request('/admin/queues', {headers: session})).status).toBe(404);
  });

  it('serves admins', async () => {
    const admin = await signUp(t.app, ADMIN_EMAIL);
    const page = await t.app.request('/admin/queues', {headers: admin});
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Vidflow queues');
    const api = await t.app.request('/admin/queues/api/queues', {headers: admin});
    expect(api.status).toBe(200);
    const body = (await api.json()) as {queues: {name: string}[]};
    expect(body.queues.map((q) => q.name).sort()).toEqual([
      'dead',
      'deliver',
      'maintenance',
      'notify',
      'package',
      'probe',
      'thumbnail',
      'transcode',
    ]);
  });
});
