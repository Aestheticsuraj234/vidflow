/** Fan-out and delivery against a real HTTP receiver, Postgres and Redis. */
import {createServer, type IncomingMessage, type Server} from 'node:http';
import type {AddressInfo} from 'node:net';

import {WebhookRepository} from '@vidflow/db';
import {jobIds} from '@vidflow/queues';
import {createTestContext} from '@vidflow/test-utils';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';

import {deliver, fanOut, type NotifyDeps} from '../src/notify';
import {verifySignature} from '../src/signature';

const t = createTestContext('notify');
const webhooks = new WebhookRepository(t.db);
let deps: NotifyDeps;
let server: Server;
let url: string;
let respond = 200;
let received: {headers: IncomingMessage['headers']; body: string}[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      received.push({headers: req.headers, body});
      res.writeHead(respond).end(respond >= 400 ? 'nope' : 'ok');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
  deps = {
    videos: t.videos,
    webhooks,
    storage: t.storage,
    pipeline: t.pipeline,
    allowPrivate: true,
    timeoutMs: 2000,
  };
});
beforeEach(() => {
  respond = 200;
  received = [];
});
afterAll(async () => {
  server.close();
  await t.close();
});

async function readyVideoWithHook(events = ['video.ready']) {
  const video = await t.uploadedVideo('landscape.mp4', 'ready');
  const hook = await webhooks.create({userId: video.userId, url, events});
  return {video, hook};
}

describe('fanOut', () => {
  it('creates one delivery per subscribed endpoint and queues it', async () => {
    const {video, hook} = await readyVideoWithHook();
    await webhooks.create({userId: video.userId, url, events: ['video.failed']}); // not subscribed
    const result = await fanOut(deps, {
      videoId: video.id,
      userId: video.userId,
      event: 'video.ready',
    });
    expect(result).toEqual({deliveries: 1});
    const [delivery] = await webhooks.listDeliveries(hook.id);
    expect(delivery).toMatchObject({event: 'video.ready', status: 'pending', videoId: video.id});
    expect(await t.pipeline.queue('deliver').getJob(jobIds.deliver(delivery!.id))).toBeTruthy();

    // A retried notify job doesn't send it again.
    expect(
      await fanOut(deps, {videoId: video.id, userId: video.userId, event: 'video.ready'}),
    ).toEqual({deliveries: 0});
  });
});

describe('deliver', () => {
  it('POSTs a signed payload and logs success', async () => {
    const {video, hook} = await readyVideoWithHook();
    await fanOut(deps, {videoId: video.id, userId: video.userId, event: 'video.ready'});
    const [delivery] = await webhooks.listDeliveries(hook.id);
    const result = await deliver(deps, {deliveryId: delivery!.id}, 1);
    expect(result.statusCode).toBe(200);

    const [req] = received;
    expect(req?.headers['vidflow-event']).toBe('video.ready');
    expect(req?.headers['vidflow-delivery']).toBe(delivery!.id);
    expect(verifySignature(hook.secret, req!.body, String(req?.headers['vidflow-signature']))).toBe(
      true,
    );
    const payload = JSON.parse(req!.body);
    expect(payload).toMatchObject({
      id: delivery!.id,
      type: 'video.ready',
      data: {
        video: {
          id: video.id,
          status: 'ready',
          playbackUrl: expect.stringContaining('/master.m3u8'),
        },
      },
    });
    const [after] = await webhooks.listDeliveries(hook.id);
    expect(after).toMatchObject({status: 'delivered', attempts: 1, lastStatusCode: 200});

    // Already delivered: a duplicate job doesn't call the receiver again.
    await deliver(deps, {deliveryId: delivery!.id}, 2);
    expect(received).toHaveLength(1);
  });

  it('retries on 5xx and gives up for good on other 4xx', async () => {
    const {video, hook} = await readyVideoWithHook();
    await fanOut(deps, {videoId: video.id, userId: video.userId, event: 'video.ready'});
    const [delivery] = await webhooks.listDeliveries(hook.id);

    respond = 503;
    await expect(deliver(deps, {deliveryId: delivery!.id}, 1)).rejects.toMatchObject({
      name: 'Error',
      message: 'HTTP 503: nope',
    });
    expect((await webhooks.listDeliveries(hook.id))[0]).toMatchObject({
      status: 'pending',
      attempts: 1,
      lastStatusCode: 503,
    });

    respond = 400;
    await expect(deliver(deps, {deliveryId: delivery!.id}, 2)).rejects.toMatchObject({
      name: 'UnrecoverableError',
    });
    expect((await webhooks.listDeliveries(hook.id))[0]).toMatchObject({
      status: 'failed',
      attempts: 2,
      lastStatusCode: 400,
    });
  });

  it('refuses private addresses unless allowed', async () => {
    const {video, hook} = await readyVideoWithHook();
    await fanOut(deps, {videoId: video.id, userId: video.userId, event: 'video.ready'});
    const [delivery] = await webhooks.listDeliveries(hook.id);
    await expect(
      deliver({...deps, allowPrivate: false}, {deliveryId: delivery!.id}, 1),
    ).rejects.toMatchObject({
      name: 'UnrecoverableError',
      message: expect.stringMatching(/private address/),
    });
    expect(received).toEqual([]);
  });

  it('records timeouts and connection errors as retryable', async () => {
    const {video} = await readyVideoWithHook();
    const dead = await webhooks.create({
      userId: video.userId,
      url: 'http://127.0.0.1:1/x',
      events: ['video.ready'],
    });
    await fanOut(deps, {videoId: video.id, userId: video.userId, event: 'video.ready'});
    const [delivery] = await webhooks.listDeliveries(dead.id);
    await expect(deliver(deps, {deliveryId: delivery!.id}, 1)).rejects.toThrow(/ECONNREFUSED/);
    expect((await webhooks.listDeliveries(dead.id))[0]).toMatchObject({
      status: 'pending',
      lastError: expect.stringMatching(/ECONNREFUSED/),
    });
  });
});
