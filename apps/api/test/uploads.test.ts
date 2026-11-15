/** The direct-upload flow against real Postgres and RustFS. */
import type {
  CreateUploadResponse,
  SignPartsResponse,
  UploadStatusResponse,
  VideoSummary,
} from '@vidflow/shared';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import type {ErrorBody} from '../src/lib/errors';
import {makeTestApp, signUp} from './helpers';

const MiB = 1024 * 1024;
const uploaded: string[] = [];
const t = makeTestApp({
  onUploaded: async (video) => {
    uploaded.push(video.id);
  },
});
let headers: Record<string, string>;

beforeAll(async () => {
  headers = await signUp(t.app);
});
afterAll(() => t.close());

async function post<T>(path: string, body: unknown, h = headers) {
  const res = await t.app.request(path, {method: 'POST', headers: h, body: JSON.stringify(body)});
  return {res, json: (await res.json()) as T};
}

async function create(sizeBytes: number) {
  return post<CreateUploadResponse>('/v1/videos', {
    title: 'Demo',
    fileName: 'demo.mp4',
    contentType: 'video/mp4',
    sizeBytes,
  });
}

async function putPart(url: string, body: Buffer): Promise<string> {
  const res = await fetch(url, {method: 'PUT', body});
  expect(res.status).toBe(200);
  return res.headers.get('etag') ?? '';
}

describe('direct uploads', () => {
  it('rejects unsupported types and oversized files', async () => {
    const bad = await post<ErrorBody>('/v1/videos', {
      title: 'x',
      fileName: 'a.pdf',
      contentType: 'application/pdf',
      sizeBytes: 10,
    });
    expect(bad.res.status).toBe(400);
    expect((await create(500 * MiB)).res.status).toBe(413);
  });

  it('requires a session', async () => {
    const res = await t.app.request('/v1/videos');
    expect(res.status).toBe(401);
  });

  it('uploads in parts, resumes, and completes', async () => {
    const size = 16 * MiB + 1000; // two parts
    const {res, json} = await create(size);
    expect(res.status).toBe(201);
    expect(json.video.status).toBe('uploading');
    expect(json.upload).toMatchObject({partSize: 16 * MiB, partCount: 2});
    const id = json.video.id;

    // Upload part 1, then "refresh the page".
    const signed = await post<SignPartsResponse>(`/v1/videos/${id}/upload/parts`, {
      partNumbers: [1, 2],
    });
    const etag1 = await putPart(signed.json.parts[0]!.url, Buffer.alloc(16 * MiB, 1));

    const status = await t.app.request(`/v1/videos/${id}/upload`, {headers});
    const resume = (await status.json()) as UploadStatusResponse;
    expect(resume.uploadedParts.map((p) => p.partNumber)).toEqual([1]);

    // Resume: only the missing part.
    const again = await post<SignPartsResponse>(`/v1/videos/${id}/upload/parts`, {
      partNumbers: [2],
    });
    const etag2 = await putPart(again.json.parts[0]!.url, Buffer.alloc(1000, 2));

    const done = await post<VideoSummary>(`/v1/videos/${id}/upload/complete`, {
      parts: [
        {partNumber: 1, etag: etag1},
        {partNumber: 2, etag: etag2},
      ],
    });
    expect(done.res.status).toBe(200);
    expect(done.json.status).toBe('uploaded');
    expect(uploaded).toContain(id);
    expect((await t.storage.head(`sources/${id}/original.mp4`))?.sizeBytes).toBe(size);

    // Finished uploads can't be completed twice.
    const twice = await post<ErrorBody>(`/v1/videos/${id}/upload/complete`, {
      parts: [{partNumber: 1, etag: etag1}],
    });
    expect(twice.res.status).toBe(409);
  });

  it('refuses to complete with missing parts', async () => {
    const {json} = await create(16 * MiB + 1);
    const signed = await post<SignPartsResponse>(`/v1/videos/${json.video.id}/upload/parts`, {
      partNumbers: [1],
    });
    const etag = await putPart(signed.json.parts[0]!.url, Buffer.alloc(16 * MiB));
    const done = await post<ErrorBody>(`/v1/videos/${json.video.id}/upload/complete`, {
      parts: [{partNumber: 1, etag}],
    });
    expect(done.res.status).toBe(400);
  });

  it('fails the video when the uploaded size is wrong', async () => {
    const {json} = await create(5000);
    const signed = await post<SignPartsResponse>(`/v1/videos/${json.video.id}/upload/parts`, {
      partNumbers: [1],
    });
    const etag = await putPart(signed.json.parts[0]!.url, Buffer.alloc(10));
    const done = await post<ErrorBody>(`/v1/videos/${json.video.id}/upload/complete`, {
      parts: [{partNumber: 1, etag}],
    });
    expect(done.res.status).toBe(400);
    const video = await t.app.request(`/v1/videos/${json.video.id}`, {headers});
    expect(((await video.json()) as VideoSummary).status).toBe('failed');
  });

  it('rejects part numbers past the end', async () => {
    const {json} = await create(100);
    const res = await post<ErrorBody>(`/v1/videos/${json.video.id}/upload/parts`, {
      partNumbers: [2],
    });
    expect(res.res.status).toBe(400);
  });

  it('cancels an upload', async () => {
    const {json} = await create(100);
    const res = await t.app.request(`/v1/videos/${json.video.id}/upload`, {
      method: 'DELETE',
      headers,
    });
    expect(((await res.json()) as VideoSummary).status).toBe('canceled');
  });

  it("hides other users' videos", async () => {
    const {json} = await create(100);
    const other = await signUp(t.app);
    const res = await t.app.request(`/v1/videos/${json.video.id}`, {headers: other});
    expect(res.status).toBe(404);
    const list = await t.app.request('/v1/videos', {headers: other});
    expect(((await list.json()) as {videos: unknown[]}).videos).toEqual([]);
  });
});
