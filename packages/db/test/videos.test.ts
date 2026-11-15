import {randomUUID} from 'node:crypto';

import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {canTransitionVideo, createDb, isFinalVideoStatus, schema, VideoRepository} from '../src';

const {db, pool} = createDb(
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/vidflow',
);
const videos = new VideoRepository(db);
const userId = `user-${randomUUID()}`;
const otherId = `user-${randomUUID()}`;

beforeAll(async () => {
  await db.insert(schema.user).values([
    {id: userId, name: 'Owner', email: `${userId}@t.dev`},
    {id: otherId, name: 'Other', email: `${otherId}@t.dev`},
  ]);
});

afterAll(async () => {
  await pool.end();
});

describe('video state machine', () => {
  it('follows the pipeline order', () => {
    expect(canTransitionVideo('created', 'uploading')).toBe(true);
    expect(canTransitionVideo('uploaded', 'probing')).toBe(true);
    expect(canTransitionVideo('probing', 'processing')).toBe(true);
    expect(canTransitionVideo('processing', 'ready')).toBe(true);
  });

  it('cannot skip stages or leave a final state', () => {
    expect(canTransitionVideo('created', 'ready')).toBe(false);
    expect(canTransitionVideo('ready', 'processing')).toBe(false);
    expect(canTransitionVideo('canceled', 'uploaded')).toBe(false);
    expect(isFinalVideoStatus('failed')).toBe(true);
  });
});

describe('VideoRepository', () => {
  it('creates a video owned by a user', async () => {
    const v = await videos.create({userId, title: 'Demo'});
    expect(v).toMatchObject({status: 'created', progress: 0});
    expect(await videos.findForUser(v.id, userId)).toBeDefined();
    expect(await videos.findForUser(v.id, otherId)).toBeUndefined();
  });

  it('only allows legal transitions, atomically', async () => {
    const v = await videos.create({userId, title: 'Flow'});
    expect(await videos.transition(v.id, 'ready')).toBeUndefined();
    expect((await videos.transition(v.id, 'uploaded', {sourceKey: 'k'}))?.sourceKey).toBe('k');
    const [a, b] = await Promise.all([
      videos.transition(v.id, 'probing'),
      videos.transition(v.id, 'probing'),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it('a canceled video cannot be moved on by a late worker', async () => {
    const v = await videos.create({userId, title: 'Cancel'});
    await videos.transition(v.id, 'uploaded');
    await videos.transition(v.id, 'canceled');
    expect(await videos.transition(v.id, 'probing')).toBeUndefined();
  });

  it('stores renditions once per name, sorted from highest', async () => {
    const v = await videos.create({userId, title: 'Ladder'});
    const ladder = [
      {
        videoId: v.id,
        name: '360p',
        width: 640,
        height: 360,
        videoBitrateKbps: 800,
        audioBitrateKbps: 96,
      },
      {
        videoId: v.id,
        name: '720p',
        width: 1280,
        height: 720,
        videoBitrateKbps: 2800,
        audioBitrateKbps: 128,
      },
    ];
    await videos.createRenditions(ladder);
    await videos.createRenditions(ladder);
    expect((await videos.listRenditions(v.id)).map((r) => r.name)).toEqual(['720p', '360p']);
  });

  it('upserts assets by key and records a timeline', async () => {
    const v = await videos.create({userId, title: 'Assets'});
    const key = `videos/${v.id}/poster.jpg`;
    await videos.upsertAsset({videoId: v.id, kind: 'poster', key, contentType: 'image/jpeg'});
    await videos.upsertAsset({
      videoId: v.id,
      kind: 'poster',
      key,
      contentType: 'image/jpeg',
      width: 1280,
    });
    expect(await videos.listAssets(v.id)).toHaveLength(1);
    await videos.addEvent(v.id, 'probe', 'started');
    await videos.addEvent(v.id, 'probe', 'done');
    expect((await videos.listEvents(v.id)).map((e) => e.message)).toEqual(['started', 'done']);
  });

  it('cascades deletes to renditions and assets', async () => {
    const v = await videos.create({userId, title: 'Delete'});
    await videos.createRenditions([
      {
        videoId: v.id,
        name: '360p',
        width: 640,
        height: 360,
        videoBitrateKbps: 800,
        audioBitrateKbps: 96,
      },
    ]);
    await videos.delete(v.id);
    expect(await videos.listRenditions(v.id)).toEqual([]);
  });
});
