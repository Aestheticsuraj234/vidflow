import {randomUUID} from 'node:crypto';

import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {ApiKeyRepository, createDb, hashApiKey, schema} from '../src';

const {db, pool} = createDb(
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/vidflow',
);
const keys = new ApiKeyRepository(db);
const userId = `user-${randomUUID()}`;
const otherId = `user-${randomUUID()}`;

beforeAll(async () => {
  await db.insert(schema.user).values([
    {id: userId, name: 'Key Owner', email: `${userId}@test.dev`},
    {id: otherId, name: 'Other', email: `${otherId}@test.dev`},
  ]);
});

afterAll(async () => {
  await pool.end();
});

describe('ApiKeyRepository', () => {
  it('stores only a hash and a short prefix', async () => {
    const {key, apiKey} = await keys.create(userId, 'ci');
    expect(key).toMatch(/^vf_[\w-]{40}$/);
    expect(apiKey.hash).toBe(hashApiKey(key));
    expect(apiKey.prefix).toBe(key.slice(0, 12));
    expect(JSON.stringify(apiKey)).not.toContain(key);
  });

  it('verifies a valid key and rejects others', async () => {
    const {key, apiKey} = await keys.create(userId, 'app');
    expect((await keys.verify(key))?.id).toBe(apiKey.id);
    expect(await keys.verify(`${key}x`)).toBeUndefined();
    expect(await keys.verify('not-a-key')).toBeUndefined();
  });

  it('stops verifying a revoked key', async () => {
    const {key, apiKey} = await keys.create(userId, 'old');
    expect(await keys.revoke(apiKey.id, otherId)).toBe(false);
    expect(await keys.revoke(apiKey.id, userId)).toBe(true);
    expect(await keys.verify(key)).toBeUndefined();
    expect((await keys.listByUser(userId)).map((k) => k.id)).not.toContain(apiKey.id);
  });
});
