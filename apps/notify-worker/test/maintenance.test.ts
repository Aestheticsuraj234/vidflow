import {schema} from '@vidflow/db';
import {createTestContext} from '@vidflow/test-utils';
import {eq} from 'drizzle-orm';
import {afterAll, expect, it} from 'vitest';

import {sweepStaleUploads} from '../src/maintenance';

const t = createTestContext('maintenance');
afterAll(() => t.close());

it('cancels uploads abandoned for more than a day, and only those', async () => {
  const old = await t.uploadedVideo('silent-small.mp4', 'uploading');
  const fresh = await t.uploadedVideo('silent-small.mp4', 'uploading');
  const uploadId = await t.storage.createMultipartUpload(old.sourceKey!, 'video/mp4');
  await t.videos.update(old.id, {uploadId});
  await t.db
    .update(schema.videos)
    .set({createdAt: new Date(Date.now() - 25 * 3600_000)})
    .where(eq(schema.videos.id, old.id));

  expect(await sweepStaleUploads({videos: t.videos, storage: t.storage})).toBeGreaterThanOrEqual(1);
  expect(await t.videos.findById(old.id)).toMatchObject({status: 'canceled', uploadId: null});
  expect((await t.videos.findById(fresh.id))?.status).toBe('uploading');
  await expect(t.storage.listParts(old.sourceKey!, uploadId)).rejects.toThrow();
});
