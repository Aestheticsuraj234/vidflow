import type {VideoRepository, WebhookRepository} from '@vidflow/db';
import {
  UnrecoverableError,
  type DeliverResult,
  type JobData,
  type NotifyResult,
  type Pipeline,
} from '@vidflow/queues';
import {keys, type StorageProvider} from '@vidflow/storage';

import {postJson} from './http';
import {signPayload} from './signature';
import {assertPublicUrl} from './ssrf';

export interface NotifyDeps {
  videos: VideoRepository;
  webhooks: WebhookRepository;
  storage: StorageProvider;
  pipeline: Pipeline;
  /** Local development: allow http://localhost receivers. Never in production. */
  allowPrivate: boolean;
  timeoutMs?: number;
}

/**
 * Notify stage: turns one video event into one logged delivery per
 * subscribed endpoint, each with its own retrying `deliver` job.
 */
export async function fanOut(
  deps: NotifyDeps,
  {videoId, userId, event}: JobData<'notify'>,
): Promise<NotifyResult> {
  const endpoints = await deps.webhooks.listSubscribed(userId, event);
  if (endpoints.length === 0) return {deliveries: 0};
  const video = await deps.videos.findById(videoId);
  if (!video) return {deliveries: 0};

  const [poster] = (await deps.videos.listAssets(videoId)).filter((a) => a.kind === 'poster');
  const data = {
    video: {
      id: video.id,
      title: video.title,
      status: video.status,
      error: video.error,
      durationMs: video.durationMs,
      width: video.width,
      height: video.height,
      playbackUrl: video.status === 'ready' ? deps.storage.publicUrl(keys.master(videoId)) : null,
      posterUrl: poster ? deps.storage.publicUrl(poster.key) : null,
      createdAt: video.createdAt.toISOString(),
      readyAt: video.readyAt?.toISOString() ?? null,
    },
  };
  const created = await deps.webhooks.createDeliveries(
    endpoints.map((w) => ({webhookId: w.id, videoId, event, payload: data})),
  );
  await deps.pipeline.enqueueDeliveries(created.map((d) => d.id));
  return {deliveries: created.length};
}

/** Statuses worth retrying: the receiver is down, slow or rate-limiting us. */
function retryable(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

/**
 * Sends one delivery. 2xx is success; other 4xx means the receiver rejected
 * it and retrying won't help; anything else (5xx, timeouts, connection
 * errors) is retried with backoff. Every attempt is written to the log.
 */
export async function deliver(
  deps: NotifyDeps,
  {deliveryId}: JobData<'deliver'>,
  attempt: number,
): Promise<DeliverResult> {
  const found = await deps.webhooks.findDelivery(deliveryId);
  if (!found) throw new UnrecoverableError(`Delivery ${deliveryId} not found`);
  const {delivery, webhook} = found;
  if (delivery.status === 'delivered')
    return {statusCode: delivery.lastStatusCode ?? 200, durationMs: 0};

  const record = (patch: {
    status: 'pending' | 'delivered' | 'failed';
    code: number | null;
    error: string | null;
  }) =>
    deps.webhooks.recordAttempt(deliveryId, {
      status: patch.status,
      attempts: attempt,
      lastStatusCode: patch.code,
      lastError: patch.error,
      ...(patch.status === 'delivered' ? {deliveredAt: new Date()} : {}),
    });

  if (!webhook.active) {
    await record({status: 'failed', code: null, error: 'Endpoint is disabled'});
    throw new UnrecoverableError('Endpoint is disabled');
  }

  const body = JSON.stringify({
    id: delivery.id,
    type: delivery.event,
    createdAt: delivery.createdAt.toISOString(),
    data: delivery.payload,
  });
  const started = Date.now();
  try {
    await assertPublicUrl(webhook.url, deps.allowPrivate);
    const res = await postJson(
      webhook.url,
      body,
      {
        'Vidflow-Signature': signPayload(webhook.secret, body, Math.floor(Date.now() / 1000)),
        'Vidflow-Event': delivery.event,
        'Vidflow-Delivery': delivery.id,
      },
      {timeoutMs: deps.timeoutMs ?? 10_000, allowPrivate: deps.allowPrivate},
    );
    const durationMs = Date.now() - started;
    if (res.statusCode >= 200 && res.statusCode < 300) {
      await record({status: 'delivered', code: res.statusCode, error: null});
      return {statusCode: res.statusCode, durationMs};
    }
    const error = `HTTP ${res.statusCode}${res.body ? `: ${res.body.slice(0, 200)}` : ''}`;
    if (!retryable(res.statusCode)) {
      await record({status: 'failed', code: res.statusCode, error});
      throw new UnrecoverableError(error);
    }
    await record({status: 'pending', code: res.statusCode, error});
    throw new Error(error);
  } catch (err) {
    if (err instanceof UnrecoverableError) throw err;
    const message = (err as Error).message;
    if (/private address|Only http/.test(message)) {
      await record({status: 'failed', code: null, error: message});
      throw new UnrecoverableError(message);
    }
    // Keep the HTTP status if we recorded one just above.
    if (!message.startsWith('HTTP ')) await record({status: 'pending', code: null, error: message});
    throw err;
  }
}
