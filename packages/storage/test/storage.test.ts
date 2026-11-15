/** S3StorageProvider against a real S3-compatible server (RustFS in dev and CI). */
import {randomUUID} from 'node:crypto';
import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {DeleteBucketCommand} from '@aws-sdk/client-s3';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {CACHE, keys, S3StorageProvider, setupBucket} from '../src';

const storage = new S3StorageProvider({
  endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  region: 'us-east-1',
  bucket: `vidflow-test-${process.pid}`,
  accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'vidflow',
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'vidflow-secret-key',
  forcePathStyle: true,
  publicBaseUrl: `${process.env.S3_ENDPOINT ?? 'http://localhost:9000'}/vidflow-test-${process.pid}`,
});
const videoId = randomUUID();

beforeAll(async () => {
  await setupBucket(storage, {allowedOrigins: ['http://localhost:3000'], publicReadPolicy: true});
});

afterAll(async () => {
  for (const prefix of ['sources/', 'work/', 'public/']) await storage.deletePrefix(prefix);
  await storage.client.send(new DeleteBucketCommand({Bucket: storage.bucket}));
});

describe('keys', () => {
  it('keeps sources private and outputs public', () => {
    expect(keys.source('v1', '.MP4')).toBe('sources/v1/original.mp4');
    expect(keys.renditionDir('v1', '720p')).toBe('public/videos/v1/720p/');
    expect(keys.master('v1')).toMatch(/^public\//);
    expect(keys.allPrefixes('v1')).toHaveLength(3);
  });
});

describe('S3StorageProvider', () => {
  it('puts, heads and reads objects', async () => {
    const key = `work/${videoId}/a.txt`;
    await storage.put(key, 'hello', {contentType: 'text/plain'});
    expect(await storage.head(key)).toMatchObject({sizeBytes: 5, contentType: 'text/plain'});
    expect(await storage.getText(key)).toBe('hello');
    expect(await storage.head(`work/${videoId}/missing`)).toBeNull();
  });

  it('uploads and downloads files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vf-'));
    await writeFile(join(dir, 'in.bin'), Buffer.alloc(200_000, 7));
    const key = `work/${videoId}/file.bin`;
    await storage.putFile(key, join(dir, 'in.bin'), {contentType: 'application/octet-stream'});
    await storage.download(key, join(dir, 'out.bin'));
    expect((await readFile(join(dir, 'out.bin'))).length).toBe(200_000);
  });

  it('serves public keys anonymously and keeps private keys private', async () => {
    await storage.put(keys.poster(videoId), 'jpg', {
      contentType: 'image/jpeg',
      cacheControl: CACHE.immutable,
    });
    const pub = await fetch(storage.publicUrl(keys.poster(videoId)));
    expect(pub.status).toBe(200);
    const priv = await fetch(storage.publicUrl(keys.poster(videoId)).replace('public/', 'work/'));
    expect(priv.status).toBe(403);
    expect(() => storage.publicUrl(keys.source(videoId, 'mp4'))).toThrow(/not a public key/);
  });

  it('presigns GET URLs for private objects', async () => {
    const key = `work/${videoId}/secret.txt`;
    await storage.put(key, 'secret', {contentType: 'text/plain'});
    const res = await fetch(await storage.presignGet(key, 60));
    expect(await res.text()).toBe('secret');
  });

  it('does a browser-style multipart upload with presigned parts', async () => {
    const key = keys.source(videoId, 'mp4');
    const uploadId = await storage.createMultipartUpload(key, 'video/mp4');
    const part = Buffer.alloc(5 * 1024 * 1024, 1); // S3 minimum part size
    const etags = [];
    for (const partNumber of [1, 2]) {
      const url = await storage.presignUploadPart(key, uploadId, partNumber);
      const res = await fetch(url, {
        method: 'PUT',
        body: partNumber === 1 ? part : Buffer.from('tail'),
        headers: {Origin: 'http://localhost:3000'},
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-expose-headers')).toMatch(/ETag/i);
      etags.push({partNumber, etag: res.headers.get('etag') ?? ''});
    }
    // Resuming relies on asking storage which parts it already has.
    expect((await storage.listParts(key, uploadId)).map((p) => p.partNumber)).toEqual([1, 2]);
    await storage.completeMultipartUpload(key, uploadId, etags.reverse());
    expect((await storage.head(key))?.sizeBytes).toBe(part.length + 4);
  });

  it('aborts a multipart upload', async () => {
    const key = `sources/${videoId}/aborted.mp4`;
    const uploadId = await storage.createMultipartUpload(key, 'video/mp4');
    await storage.abortMultipartUpload(key, uploadId);
    await expect(storage.listParts(key, uploadId)).rejects.toThrow();
  });

  it('lists and deletes everything under a prefix', async () => {
    const prefix = `work/${videoId}/many/`;
    for (let i = 0; i < 5; i++)
      await storage.put(`${prefix}${i}`, 'x', {contentType: 'text/plain'});
    expect(await storage.list(prefix)).toHaveLength(5);
    expect(await storage.deletePrefix(prefix)).toBe(5);
    expect(await storage.list(prefix)).toEqual([]);
    await expect(storage.deletePrefix('work')).rejects.toThrow(/ending in/);
  });
});
