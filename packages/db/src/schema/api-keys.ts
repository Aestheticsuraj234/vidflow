import {index, pgTable, text, timestamp, uuid} from 'drizzle-orm/pg-core';

import {user} from './auth';

/**
 * API keys for calling the engine from other apps. Only a SHA-256 hash is
 * stored; the full key is shown once, at creation.
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, {onDelete: 'cascade'}),
    name: text().notNull(),
    /** First characters of the key, shown in the UI to tell keys apart. */
    prefix: text().notNull(),
    hash: text().notNull().unique(),
    lastUsedAt: timestamp({withTimezone: true}),
    revokedAt: timestamp({withTimezone: true}),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  (t) => [index('api_keys_user_idx').on(t.userId)],
);
