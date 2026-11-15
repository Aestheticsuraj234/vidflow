import {boolean, index, integer, jsonb, pgTable, text, timestamp, uuid} from 'drizzle-orm/pg-core';

import {user} from './auth';
import {webhookDeliveryStatus} from './enums';
import {videos} from './videos';

/** Where to send events. `secret` signs every delivery (HMAC-SHA256). */
export const webhooks = pgTable(
  'webhooks',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, {onDelete: 'cascade'}),
    url: text().notNull(),
    secret: text().notNull(),
    events: text().array().notNull(),
    active: boolean().notNull().default(true),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  (t) => [index('webhooks_user_idx').on(t.userId)],
);

/** One attempt-tracked delivery of one event to one webhook. */
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid().primaryKey().defaultRandom(),
    webhookId: uuid()
      .notNull()
      .references(() => webhooks.id, {onDelete: 'cascade'}),
    videoId: uuid().references(() => videos.id, {onDelete: 'set null'}),
    event: text().notNull(),
    payload: jsonb().notNull(),
    status: webhookDeliveryStatus().notNull().default('pending'),
    attempts: integer().notNull().default(0),
    lastStatusCode: integer(),
    lastError: text(),
    deliveredAt: timestamp({withTimezone: true}),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  (t) => [index('webhook_deliveries_webhook_idx').on(t.webhookId, t.createdAt)],
);
