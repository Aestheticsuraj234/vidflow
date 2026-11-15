import {pgEnum} from 'drizzle-orm/pg-core';

/**
 * Video lifecycle. `ready`, `failed` and `canceled` are final.
 *
 *   created → uploading → uploaded → probing → processing → ready
 *                                       └──────────┴──────→ failed
 *   (any non-final state) → canceled
 */
export const videoStatus = pgEnum('video_status', [
  'created',
  'uploading',
  'uploaded',
  'probing',
  'processing',
  'ready',
  'failed',
  'canceled',
]);

/** One quality level of a video, from encode to HLS. */
export const renditionStatus = pgEnum('rendition_status', [
  'pending',
  'transcoding',
  'transcoded',
  'packaged',
  'failed',
]);

export const assetKind = pgEnum('asset_kind', ['poster', 'thumbnail', 'sprite', 'sprite_vtt']);

export const webhookDeliveryStatus = pgEnum('webhook_delivery_status', [
  'pending',
  'delivered',
  'failed',
]);

export type VideoStatus = (typeof videoStatus.enumValues)[number];
export type RenditionStatus = (typeof renditionStatus.enumValues)[number];
export type AssetKind = (typeof assetKind.enumValues)[number];
export type WebhookDeliveryStatus = (typeof webhookDeliveryStatus.enumValues)[number];
