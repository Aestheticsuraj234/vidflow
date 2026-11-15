import {createHash, randomBytes} from 'node:crypto';

import {and, desc, eq, isNull} from 'drizzle-orm';

import type {Database} from '../client';
import {apiKeys} from '../schema';

export type ApiKey = typeof apiKeys.$inferSelect;

const KEY_PREFIX = 'vf_';
/** Characters of the key kept in clear text to tell keys apart in the UI. */
const VISIBLE_PREFIX_LENGTH = 12;

/** SHA-256 of the key. Keys are random, so a plain fast hash is enough. */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** A new key: `vf_` + 40 URL-safe random characters (240 bits). */
export function generateApiKey(): string {
  return KEY_PREFIX + randomBytes(30).toString('base64url');
}

/** Creates, verifies, lists and revokes API keys. Only hashes are stored. */
export class ApiKeyRepository {
  constructor(private readonly db: Database) {}

  /** Creates a key and returns it in full. This is the only time it is visible. */
  async create(userId: string, name: string): Promise<{key: string; apiKey: ApiKey}> {
    const key = generateApiKey();
    const [apiKey] = await this.db
      .insert(apiKeys)
      .values({userId, name, prefix: key.slice(0, VISIBLE_PREFIX_LENGTH), hash: hashApiKey(key)})
      .returning();
    if (!apiKey) throw new Error('Failed to create API key');
    return {key, apiKey};
  }

  /** The active key matching `key`, or undefined. */
  async verify(key: string): Promise<ApiKey | undefined> {
    if (!key.startsWith(KEY_PREFIX)) return undefined;
    const [row] = await this.db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.hash, hashApiKey(key)), isNull(apiKeys.revokedAt)));
    return row;
  }

  async touch(id: string): Promise<void> {
    await this.db.update(apiKeys).set({lastUsedAt: new Date()}).where(eq(apiKeys.id, id));
  }

  listByUser(userId: string): Promise<ApiKey[]> {
    return this.db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
      .orderBy(desc(apiKeys.createdAt));
  }

  /** Revokes one of the user's keys. Returns false if it is not theirs. */
  async revoke(id: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .update(apiKeys)
      .set({revokedAt: new Date()})
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
      .returning({id: apiKeys.id});
    return rows.length === 1;
  }
}
