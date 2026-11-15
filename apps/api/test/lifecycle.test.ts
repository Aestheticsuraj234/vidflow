/** Cancel, delete and rate limits against real Postgres, RustFS and Redis. */
import {VideoRepository} from '@vidflow/db';
import {jobIds} from '@vidflow/queues';
import type {CreateUploadResponse, VideoSummary} from '@vidflow/shared';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import type {ErrorBody} from '../src/lib/errors';
import type {createApp} from '../src/app';
import {env, makeTestApp, signUp} from './helpers';

const t = makeTestApp();
let headers: Record<string, string>;
beforeAll(async () => {
  headers = await signUp(t.app);
});
afterAll(() => t.close());

const create = async (h = headers, app: ReturnType<typeof createApp> = t.app) => {
  const res = await app.request('/v1/videos', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({title: 'x', fileName: 'x.mp4', contentType: 'video/mp4', sizeBytes: 100}),
  });
  return {res, json: (await res.json()) as CreateUploadResponse & ErrorBody};
};

/** Pretend the pipeline is mid-flight: source stored, flow queued. */
async function processingVideo() {
  const {json} = await create();
  const id = json.video.id;
  const repo = new VideoRepository(t.db);
  await t.storage.put(`sources/${id}/original.mp4`, 'x', {contentType: 'video/mp4'});
  await t.storage.put(`public/videos/${id}/poster.jpg`, 'x', {contentType: 'image/jpeg'});
  await repo.transition(id, 'uploaded');
  await repo.transition(id, 'probing');
  await repo.transition(id, 'processing');
  const rows = await repo.createRenditions([
    {
      videoId: id,
      name: '360p',
      width: 640,
      height: 360,
      videoBitrateKbps: 800,
      audioBitrateKbps: 96,
    },
  ]);
  await t.pipeline.startProcessing({
    videoId: id,
    durationMs: 1000,
    gopFrames: 60,
    renditions: rows.map((r) => ({
      id: r.id,
      name: r.name,
      width: r.width,
      height: r.height,
      videoBitrateKbps: 800,
      audioBitrateKbps: 96,
    })),
  });
  return id;
}

describe('cancel', () => {
  it('stops a processing video: jobs removed, files deleted', async () => {
    const id = await processingVideo();
    const res = await t.app.request(`/v1/videos/${id}/cancel`, {method: 'POST', headers});
    expect(res.status).toBe(200);
    expect(((await res.json()) as VideoSummary).status).toBe('canceled');
    expect(await t.pipeline.queue('package').getJob(jobIds.package(id))).toBeUndefined();
    expect(
      await t.pipeline.queue('transcode').getJob(jobIds.transcode(id, '360p')),
    ).toBeUndefined();
    expect(await t.storage.list(`public/videos/${id}/`)).toEqual([]);
    expect(await t.storage.list(`sources/${id}/`)).toEqual([]);

    // Twice is a conflict, not a crash.
    expect((await t.app.request(`/v1/videos/${id}/cancel`, {method: 'POST', headers})).status).toBe(
      409,
    );
  });

  it('aborts an upload in progress', async () => {
    const {json} = await create();
    const res = await t.app.request(`/v1/videos/${json.video.id}/cancel`, {
      method: 'POST',
      headers,
    });
    expect(((await res.json()) as VideoSummary).status).toBe('canceled');
  });
});

describe('delete', () => {
  it('removes the video, its files and its rows', async () => {
    const id = await processingVideo();
    expect((await t.app.request(`/v1/videos/${id}`, {method: 'DELETE', headers})).status).toBe(204);
    expect((await t.app.request(`/v1/videos/${id}`, {headers})).status).toBe(404);
    expect(await t.storage.list(`public/videos/${id}/`)).toEqual([]);
  });

  it("can't delete someone else's video", async () => {
    const {json} = await create();
    const other = await signUp(t.app);
    expect(
      (await t.app.request(`/v1/videos/${json.video.id}`, {method: 'DELETE', headers: other}))
        .status,
    ).toBe(404);
  });
});

describe('rate limits', () => {
  it('limits uploads per hour', async () => {
    const strict = makeTestApp({env: {...env, UPLOADS_PER_HOUR: 2}});
    const h = await signUp(strict.app);
    expect((await create(h, strict.app)).res.status).toBe(201);
    expect((await create(h, strict.app)).res.status).toBe(201);
    const third = await create(h, strict.app);
    expect(third.res.status).toBe(429);
    expect(third.json.error.code).toBe('rate_limited');
    expect(Number(third.res.headers.get('retry-after'))).toBeGreaterThan(0);
    await strict.close();
  });

  it('limits videos in the pipeline at once', async () => {
    const strict = makeTestApp({env: {...env, MAX_ACTIVE_VIDEOS: 1}});
    const h = await signUp(strict.app);
    const first = await create(h, strict.app);
    await new VideoRepository(strict.db).transition(first.json.video.id, 'uploaded');
    const second = await create(h, strict.app);
    expect(second.res.status).toBe(429);
    expect(second.json.error.message).toMatch(/already processing/);
    await strict.close();
  });
});
