/**
 * Shared setup for worker integration tests: real Postgres, RustFS and Redis,
 * isolated by a per-process queue prefix and fresh users and videos.
 */
import {randomUUID} from 'node:crypto';
import {extname} from 'node:path';

import {eq} from 'drizzle-orm';
import {createDb, schema, VideoRepository, type Video, type VideoStatus} from '@vidflow/db';
import {fixture} from '@vidflow/media/testing';
import {Pipeline, QUEUE_NAMES} from '@vidflow/queues';
import {CACHE, keys, S3StorageProvider} from '@vidflow/storage';

export {fixture};

export const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export function testStorage(): S3StorageProvider {
  const endpoint = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
  const bucket = process.env.S3_BUCKET ?? 'vidflow';
  return new S3StorageProvider({
    endpoint,
    region: 'us-east-1',
    bucket,
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'vidflow',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'vidflow-secret-key',
    forcePathStyle: true,
    publicBaseUrl: `${endpoint}/${bucket}`,
  });
}

export interface TestContext {
  db: ReturnType<typeof createDb>['db'];
  videos: VideoRepository;
  storage: S3StorageProvider;
  pipeline: Pipeline;
  prefix: string;
  redisUrl: string;
  createUser(): Promise<string>;
  /** A video whose source file is already in storage, in status `uploaded` by default. */
  uploadedVideo(fixtureName: string, status?: VideoStatus): Promise<Video>;
  close(): Promise<void>;
}

export function createTestContext(name: string): TestContext {
  const {db, pool} = createDb(
    process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/vidflow',
  );
  const videos = new VideoRepository(db);
  const storage = testStorage();
  const prefix = `vidflow-test-${name}-${process.pid}`;
  const pipeline = new Pipeline({redisUrl: TEST_REDIS_URL, prefix, onError: () => undefined});
  const created: string[] = [];

  async function createUser(): Promise<string> {
    const id = randomUUID();
    await db.insert(schema.user).values({id, name: 'Test', email: `${id}@test.dev`});
    return id;
  }

  return {
    db,
    videos,
    storage,
    pipeline,
    prefix,
    redisUrl: TEST_REDIS_URL,
    createUser,
    async uploadedVideo(fixtureName, status = 'uploaded') {
      const path = fixture(fixtureName);
      const userId = await createUser();
      const video = await videos.create({userId, title: fixtureName});
      const sourceKey = keys.source(video.id, extname(path));
      await storage.putFile(sourceKey, path, {
        contentType: 'video/mp4',
        cacheControl: CACHE.private,
      });
      created.push(video.id);
      await videos.update(video.id, {sourceKey});
      // Tests start mid-pipeline, so set the status directly.
      const [row] = await db
        .update(schema.videos)
        .set({status})
        .where(eq(schema.videos.id, video.id))
        .returning();
      if (!row) throw new Error('could not create test video');
      return row;
    },
    async close() {
      for (const id of created) {
        for (const p of keys.allPrefixes(id)) await storage.deletePrefix(p).catch(() => 0);
      }
      for (const q of QUEUE_NAMES) await pipeline.queue(q).obliterate({force: true});
      await pipeline.close();
      await pool.end();
    },
  };
}
