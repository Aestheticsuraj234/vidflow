import {jobIds} from '@vidflow/queues';
import type {CreatedWebhook, WebhookDeliverySummary, WebhookSummary} from '@vidflow/shared';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import type {ErrorBody} from '../src/lib/errors';
import {makeTestApp, signUp} from './helpers';

const t = makeTestApp();
let headers: Record<string, string>;
beforeAll(async () => {
  headers = await signUp(t.app);
});
afterAll(() => t.close());

const call = async <T>(method: string, path: string, body?: unknown, h = headers) => {
  const res = await t.app.request(path, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  });
  return {res, json: (res.status === 204 ? null : await res.json()) as T};
};

describe('/v1/webhooks', () => {
  it('creates a webhook and shows the secret only once', async () => {
    const created = await call<CreatedWebhook>('POST', '/v1/webhooks', {
      url: 'https://example.com/hooks/vidflow',
      events: ['video.ready', 'video.failed'],
    });
    expect(created.res.status).toBe(201);
    expect(created.json.secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(created.json.secretHint).toBe(`whsec_…${created.json.secret.slice(-4)}`);

    const list = await call<{webhooks: WebhookSummary[]}>('GET', '/v1/webhooks');
    expect(list.json.webhooks).toHaveLength(1);
    expect(JSON.stringify(list.json)).not.toContain(created.json.secret);
  });

  it('validates URLs and events', async () => {
    expect(
      (await call<ErrorBody>('POST', '/v1/webhooks', {url: 'ftp://x.dev', events: ['video.ready']}))
        .res.status,
    ).toBe(400);
    expect(
      (
        await call<ErrorBody>('POST', '/v1/webhooks', {
          url: 'https://x.dev',
          events: ['video.exploded'],
        })
      ).res.status,
    ).toBe(400);
    expect(
      (await call<ErrorBody>('POST', '/v1/webhooks', {url: 'https://x.dev', events: []})).res
        .status,
    ).toBe(400);
  });

  it('updates, tests and deletes', async () => {
    const {json: hook} = await call<CreatedWebhook>('POST', '/v1/webhooks', {
      url: 'https://example.com/a',
      events: ['video.ready'],
    });
    const paused = await call<WebhookSummary>('PATCH', `/v1/webhooks/${hook.id}`, {active: false});
    expect(paused.json.active).toBe(false);

    const ping = await call<WebhookDeliverySummary>('POST', `/v1/webhooks/${hook.id}/test`);
    expect(ping.res.status).toBe(202);
    expect(ping.json).toMatchObject({event: 'webhook.test', status: 'pending', videoId: null});
    expect(await t.pipeline.queue('deliver').getJob(jobIds.deliver(ping.json.id))).toBeTruthy();

    const log = await call<{deliveries: WebhookDeliverySummary[]}>(
      'GET',
      `/v1/webhooks/${hook.id}/deliveries`,
    );
    expect(log.json.deliveries.map((d) => d.id)).toEqual([ping.json.id]);

    expect((await call('DELETE', `/v1/webhooks/${hook.id}`)).res.status).toBe(204);
    expect((await call('GET', `/v1/webhooks/${hook.id}/deliveries`)).res.status).toBe(404);
  });

  it("can't touch another user's webhook", async () => {
    const {json: hook} = await call<CreatedWebhook>('POST', '/v1/webhooks', {
      url: 'https://example.com/b',
      events: ['video.ready'],
    });
    const other = await signUp(t.app);
    expect(
      (await call('PATCH', `/v1/webhooks/${hook.id}`, {active: false}, other)).res.status,
    ).toBe(404);
    expect((await call('DELETE', `/v1/webhooks/${hook.id}`, undefined, other)).res.status).toBe(
      404,
    );
  });
});
