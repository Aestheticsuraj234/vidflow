import {randomBytes} from 'node:crypto';

import {and, arrayContains, desc, eq} from 'drizzle-orm';

import type {Database} from '../client';
import {webhookDeliveries, webhooks, type WebhookDeliveryStatus} from '../schema';

export type Webhook = typeof webhooks.$inferSelect;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;

/** `whsec_` + 32 random bytes. Shown to the user once, used to sign deliveries. */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString('base64url')}`;
}

export class WebhookRepository {
  constructor(private readonly db: Database) {}

  async create(input: {userId: string; url: string; events: string[]}): Promise<Webhook> {
    const [row] = await this.db
      .insert(webhooks)
      .values({...input, secret: generateWebhookSecret()})
      .returning();
    if (!row) throw new Error('Failed to create webhook');
    return row;
  }

  listByUser(userId: string): Promise<Webhook[]> {
    return this.db
      .select()
      .from(webhooks)
      .where(eq(webhooks.userId, userId))
      .orderBy(desc(webhooks.createdAt));
  }

  async findForUser(id: string, userId: string): Promise<Webhook | undefined> {
    const [row] = await this.db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.id, id), eq(webhooks.userId, userId)));
    return row;
  }

  async update(id: string, patch: Partial<Pick<Webhook, 'url' | 'events' | 'active'>>) {
    const [row] = await this.db.update(webhooks).set(patch).where(eq(webhooks.id, id)).returning();
    return row;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(webhooks).where(eq(webhooks.id, id));
  }

  /** Active endpoints of a user that subscribed to `event`. */
  listSubscribed(userId: string, event: string): Promise<Webhook[]> {
    return this.db
      .select()
      .from(webhooks)
      .where(
        and(
          eq(webhooks.userId, userId),
          eq(webhooks.active, true),
          arrayContains(webhooks.events, [event]),
        ),
      );
  }

  /**
   * Logs one delivery per endpoint. Rows that already exist (a retried notify
   * job) are skipped, and only new rows are returned, so nothing is sent twice.
   */
  async createDeliveries(
    rows: {webhookId: string; videoId: string | null; event: string; payload: unknown}[],
  ): Promise<WebhookDelivery[]> {
    if (rows.length === 0) return [];
    return this.db.insert(webhookDeliveries).values(rows).onConflictDoNothing().returning();
  }

  /** A delivery with the endpoint it goes to. */
  async findDelivery(
    id: string,
  ): Promise<{delivery: WebhookDelivery; webhook: Webhook} | undefined> {
    const [row] = await this.db
      .select({delivery: webhookDeliveries, webhook: webhooks})
      .from(webhookDeliveries)
      .innerJoin(webhooks, eq(webhooks.id, webhookDeliveries.webhookId))
      .where(eq(webhookDeliveries.id, id));
    return row;
  }

  async recordAttempt(
    id: string,
    patch: {
      status: WebhookDeliveryStatus;
      attempts: number;
      lastStatusCode: number | null;
      lastError: string | null;
      deliveredAt?: Date;
    },
  ): Promise<void> {
    await this.db.update(webhookDeliveries).set(patch).where(eq(webhookDeliveries.id, id));
  }

  listDeliveries(webhookId: string, limit = 50): Promise<WebhookDelivery[]> {
    return this.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.webhookId, webhookId))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(limit);
  }
}
