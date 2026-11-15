import {z} from 'zod';

export const WEBHOOK_EVENT_NAMES = [
  'video.uploaded',
  'video.processing',
  'video.ready',
  'video.failed',
] as const;

export const createWebhookSchema = z.object({
  url: z.url({protocol: /^https?$/}).max(2000),
  events: z.array(z.enum(WEBHOOK_EVENT_NAMES)).min(1),
});
export type CreateWebhookRequest = z.infer<typeof createWebhookSchema>;

export const updateWebhookSchema = z.object({
  url: z
    .url({protocol: /^https?$/})
    .max(2000)
    .optional(),
  events: z.array(z.enum(WEBHOOK_EVENT_NAMES)).min(1).optional(),
  active: z.boolean().optional(),
});

export interface WebhookSummary {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  /** Only the last characters; the full secret is shown once, at creation. */
  secretHint: string;
  createdAt: string;
}

export interface CreatedWebhook extends WebhookSummary {
  secret: string;
}

export interface WebhookDeliverySummary {
  id: string;
  event: string;
  videoId: string | null;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

/** One message on `GET /v1/live` (server-sent events, `event: video`). */
export interface LiveVideoMessage {
  videoId: string;
  status: string;
  progress: number;
  error: string | null;
  event?: {stage: string; message: string};
  at: string;
}
