import {describe, expect, it} from 'vitest';

import {fingerprint, uploadFile, type UploaderIO, type UploadProgress} from './uploader';

const PART = 16;

/** An in-memory API + storage that behaves like the real one. */
function fakeIO(opts: {failPart?: {n: number; times: number}; existing?: number[]} = {}) {
  const stored = new Map<string, string>();
  const parts = new Map<number, string>();
  for (const n of opts.existing ?? []) parts.set(n, `etag-${n}`);
  const signed: number[] = [];
  let failures = 0;
  let completed: {partNumber: number; etag: string}[] = [];
  const io: UploaderIO = {
    store: {
      getItem: (k) => stored.get(k) ?? null,
      setItem: (k, v) => void stored.set(k, v),
      removeItem: (k) => void stored.delete(k),
    },
    sleep: async () => undefined,
    async call<T>(path: string, init?: RequestInit): Promise<T> {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      const upload = {uploadId: 'u1', partSize: PART, partCount: 3};
      if (path === '/v1/videos') return {video: {id: 'v1'}, upload} as T;
      if (path.endsWith('/upload/parts')) {
        signed.push(...body.partNumbers);
        return {
          parts: body.partNumbers.map((n: number) => ({partNumber: n, url: `part:${n}`})),
        } as T;
      }
      if (path.endsWith('/upload/complete')) {
        completed = body.parts;
        return {id: 'v1', status: 'uploaded'} as T;
      }
      if (path.endsWith('/upload')) {
        return {
          upload,
          uploadedParts: [...parts].map(([partNumber, etag]) => ({partNumber, etag})),
        } as T;
      }
      throw new Error(`unexpected ${path}`);
    },
    async putPart(url, body, onProgress) {
      const n = Number(url.split(':')[1]);
      if (opts.failPart?.n === n && failures < opts.failPart.times) {
        failures++;
        throw new Error('network');
      }
      onProgress(body.size);
      parts.set(n, `etag-${n}`);
      return `etag-${n}`;
    },
  };
  return {io, stored, signed, completed: () => completed};
}

const file = new File([new Uint8Array(40)], 'clip.mp4', {type: 'video/mp4', lastModified: 1});

describe('uploadFile', () => {
  it('uploads every part and completes', async () => {
    const f = fakeIO();
    const progress: UploadProgress[] = [];
    const video = await uploadFile(file, f.io, {
      title: 'Clip',
      onProgress: (p) => progress.push(p),
    });
    expect(video.status).toBe('uploaded');
    expect(
      f
        .completed()
        .map((p) => p.partNumber)
        .sort(),
    ).toEqual([1, 2, 3]);
    expect(progress.at(-1)).toMatchObject({sentBytes: 40, partsDone: 3});
    expect(f.stored.size).toBe(0);
  });

  it('resumes: only uploads the parts storage is missing', async () => {
    const f = fakeIO({existing: [1, 3]});
    f.stored.set(fingerprint(file), 'v1');
    const progress: UploadProgress[] = [];
    await uploadFile(file, f.io, {title: 'Clip', onProgress: (p) => progress.push(p)});
    expect(f.signed).toEqual([2]);
    expect(progress[0]).toMatchObject({resumed: true, partsDone: 2, sentBytes: 16 + 8});
    expect(f.completed()).toHaveLength(3);
  });

  it('retries a flaky part', async () => {
    const f = fakeIO({failPart: {n: 2, times: 2}});
    await uploadFile(file, f.io, {title: 'Clip'});
    expect(f.signed.filter((n) => n === 2)).toHaveLength(3);
  });

  it('gives up after the retry budget', async () => {
    const f = fakeIO({failPart: {n: 2, times: 10}});
    await expect(uploadFile(file, f.io, {title: 'Clip', retries: 2})).rejects.toThrow('network');
    // The fingerprint stays so the next attempt resumes.
    expect(f.stored.get(fingerprint(file))).toBe('v1');
  });
});
