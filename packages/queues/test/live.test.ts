import {randomUUID} from 'node:crypto';

import {afterAll, describe, expect, it} from 'vitest';

import {LiveHub, LivePublisher, type LiveVideoState, type LiveVideoUpdate} from '../src';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const prefix = `vidflow-test-live-${process.pid}`;
const state = new Map<string, LiveVideoState>();
const publisher = new LivePublisher({
  redisUrl,
  prefix,
  throttleMs: 50,
  load: async (id) => state.get(id),
});
const hub = new LiveHub({redisUrl, prefix});
afterAll(async () => {
  await publisher.close();
  await hub.close();
});

const collect = async (userId: string) => {
  const got: LiveVideoUpdate[] = [];
  const stop = await hub.subscribe(userId, (u) => got.push(u));
  return {got, stop};
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('live updates', () => {
  it('delivers a change to the owner only', async () => {
    const owner = randomUUID();
    const other = randomUUID();
    const videoId = randomUUID();
    state.set(videoId, {userId: owner, status: 'processing', progress: 40, error: null});
    const a = await collect(owner);
    const b = await collect(other);
    publisher.videoChanged({videoId});
    await wait(200);
    expect(a.got).toEqual([expect.objectContaining({videoId, status: 'processing', progress: 40})]);
    expect(b.got).toEqual([]);
    await a.stop();
    await b.stop();
  });

  it('coalesces bursts but keeps every timeline event', async () => {
    const userId = randomUUID();
    const videoId = randomUUID();
    state.set(videoId, {userId, status: 'processing', progress: 10, error: null});
    const {got, stop} = await collect(userId);
    for (let i = 0; i < 20; i++) publisher.videoChanged({videoId});
    publisher.videoChanged({videoId, event: {stage: 'transcode', message: '720p done'}});
    publisher.videoChanged({videoId, event: {stage: 'transcode', message: '480p done'}});
    state.set(videoId, {userId, status: 'processing', progress: 60, error: null});
    await wait(200);
    expect(got.map((u) => u.event?.message)).toEqual(['720p done', '480p done']);
    expect(got.every((u) => u.progress === 60)).toBe(true);
    await stop();
  });

  it('fans one subscription out to many tabs and cleans up', async () => {
    const userId = randomUUID();
    const videoId = randomUUID();
    state.set(videoId, {userId, status: 'ready', progress: 100, error: null});
    const tabs = await Promise.all([collect(userId), collect(userId), collect(userId)]);
    expect(hub.connections).toBe(3);
    publisher.videoChanged({videoId});
    await wait(200);
    expect(tabs.map((t) => t.got.length)).toEqual([1, 1, 1]);
    for (const t of tabs) await t.stop();
    expect(hub.connections).toBe(0);
  });
});
