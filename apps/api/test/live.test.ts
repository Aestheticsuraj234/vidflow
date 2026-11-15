import {randomUUID} from 'node:crypto';

import {LivePublisher} from '@vidflow/queues';
import type {LiveVideoMessage, PublicUser} from '@vidflow/shared';
import {afterAll, beforeAll, expect, it} from 'vitest';

import {env, makeTestApp, signUp} from './helpers';

const t = makeTestApp();
let headers: Record<string, string>;
let userId: string;
const videoId = randomUUID();
const publisher = new LivePublisher({
  redisUrl: env.REDIS_URL,
  prefix: `vidflow-test-api-${process.pid}`,
  throttleMs: 10,
  load: async () => ({userId, status: 'processing', progress: 42, error: null}),
});

beforeAll(async () => {
  headers = await signUp(t.app);
  userId = ((await (await t.app.request('/v1/me', {headers})).json()) as PublicUser).id;
});
afterAll(async () => {
  await publisher.close();
  await t.close();
});

it('requires a session', async () => {
  expect((await t.app.request('/v1/live')).status).toBe(401);
});

it('streams video updates as server-sent events', async () => {
  const controller = new AbortController();
  const res = await t.app.request('/v1/live', {headers, signal: controller.signal});
  expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();

  let text = '';
  const until = async (needle: string) => {
    while (!text.includes(needle)) {
      const {value, done} = await reader.read();
      if (done) throw new Error('stream ended');
      text += value;
    }
  };
  await until('event: ready');
  publisher.videoChanged({videoId, event: {stage: 'transcode', message: '720p encoded'}});
  await until('event: video');
  await until('\n\n');

  const data = text.split('event: video')[1]!.split('data: ')[1]!.split('\n')[0]!;
  const message = JSON.parse(data) as LiveVideoMessage;
  expect(message).toMatchObject({
    videoId,
    status: 'processing',
    progress: 42,
    event: {message: '720p encoded'},
  });

  controller.abort();
  await reader.cancel().catch(() => undefined);
  await new Promise((r) => setTimeout(r, 50));
  expect(t.liveHub.connections).toBe(0);
});
