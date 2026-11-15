import {randomUUID} from 'node:crypto';

import {createDb} from '@vidflow/db';
import {Pipeline, QUEUE_NAMES} from '@vidflow/queues';
import {S3StorageProvider} from '@vidflow/storage';

import {createApp, type AppDeps} from '../src/app';
import {createAuth} from '../src/auth';
import {loadEnv} from '../src/env';

export const env = loadEnv({
  ...process.env,
  NODE_ENV: 'test',
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? 'test-secret-test-secret-test-secret-12',
  MAX_UPLOAD_BYTES: String(200 * 1024 * 1024),
});

export const storageConfig = {
  endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  region: 'us-east-1',
  bucket: process.env.S3_BUCKET ?? 'vidflow',
  accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'vidflow',
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'vidflow-secret-key',
  forcePathStyle: true,
  publicBaseUrl: 'http://localhost:9000/vidflow',
};

/** Queues under a prefix of their own, so tests never touch real jobs. */
export function testPipeline(redisUrl = env.REDIS_URL) {
  return new Pipeline({
    redisUrl,
    prefix: `vidflow-test-api-${process.pid}`,
    onError: () => undefined,
  });
}

/** A full app on the real database and storage, plus a teardown. */
export function makeTestApp(overrides: Partial<AppDeps> = {}) {
  const {db, pool} = createDb(env.DATABASE_URL);
  const auth = createAuth(env, db);
  const storage = new S3StorageProvider(storageConfig);
  const pipeline = testPipeline();
  const app = createApp({env, db, auth, storage, pipeline, ...overrides});
  const close = async () => {
    for (const name of QUEUE_NAMES) await pipeline.queue(name).obliterate({force: true});
    await pipeline.close();
    await pool.end();
  };
  return {app, db, storage, pipeline, close};
}

/** Signs up a fresh user and returns headers that carry their session. */
export async function signUp(app: ReturnType<typeof createApp>): Promise<Record<string, string>> {
  const res = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Origin: env.WEB_URL},
    body: JSON.stringify({
      name: 'Uploader',
      email: `u-${randomUUID()}@test.dev`,
      password: 'password123',
    }),
  });
  const cookie = res.headers.getSetCookie().find((c) => c.includes('session_token'));
  if (!cookie) throw new Error('sign-up failed');
  return {Cookie: cookie.split(';')[0] ?? '', 'Content-Type': 'application/json'};
}
