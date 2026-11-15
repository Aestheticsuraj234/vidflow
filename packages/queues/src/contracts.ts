import {z} from 'zod';

/**
 * One queue per pipeline stage. Each stage scales on its own: transcode needs
 * many CPU-heavy workers, notify needs a few light ones.
 */
export const QUEUES = {
  probe: 'probe',
  transcode: 'transcode',
  package: 'package',
  thumbnail: 'thumbnail',
  notify: 'notify',
} as const;
export type QueueName = keyof typeof QUEUES;
export const QUEUE_NAMES = Object.keys(QUEUES) as QueueName[];

export const renditionSpecSchema = z.object({
  name: z.string().regex(/^\d+p$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  videoBitrateKbps: z.number().int().positive(),
  audioBitrateKbps: z.number().int().nonnegative(),
});
export type RenditionSpec = z.infer<typeof renditionSpecSchema>;

export const WEBHOOK_EVENTS = [
  'video.uploaded',
  'video.processing',
  'video.ready',
  'video.failed',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Data and result of every job. Workers validate data before running. */
export const jobSchemas = {
  probe: z.object({videoId: z.uuid()}),
  transcode: z.object({
    videoId: z.uuid(),
    renditionId: z.uuid(),
    rendition: renditionSpecSchema,
    /** Keyframe interval in frames, identical for every rendition so segments align. */
    gopFrames: z.number().int().positive(),
  }),
  package: z.object({videoId: z.uuid()}),
  thumbnail: z.object({videoId: z.uuid()}),
  notify: z.object({
    videoId: z.uuid(),
    userId: z.string().min(1),
    event: z.enum(WEBHOOK_EVENTS),
  }),
} satisfies Record<QueueName, z.ZodType>;

export type JobData<Q extends QueueName> = z.infer<(typeof jobSchemas)[Q]>;

export interface ProbeResult {
  durationMs: number;
  renditions: string[];
}

export interface TranscodeResult {
  renditionId: string;
  name: string;
  mp4Key: string;
  sizeBytes: number;
  encodeMs: number;
}

export interface PackageResult {
  masterKey: string;
  renditions: string[];
}

export interface ThumbnailResult {
  posterKey: string;
  spriteKey: string | null;
}

export interface NotifyResult {
  deliveries: number;
}

export interface JobResults {
  probe: ProbeResult;
  transcode: TranscodeResult;
  package: PackageResult;
  thumbnail: ThumbnailResult;
  notify: NotifyResult;
}

/**
 * Deterministic job IDs make enqueueing idempotent: BullMQ ignores an add
 * whose ID already exists, so a retried API call or a re-run probe can never
 * start the same work twice. (BullMQ forbids `:` in custom IDs.)
 */
export const jobIds = {
  probe: (videoId: string) => `probe-${videoId}`,
  transcode: (videoId: string, rendition: string) => `transcode-${videoId}-${rendition}`,
  package: (videoId: string) => `package-${videoId}`,
  thumbnail: (videoId: string) => `thumbnail-${videoId}`,
  notify: (videoId: string, event: WebhookEvent) => `notify-${videoId}-${event}`,
};

/**
 * BullMQ priority: 1 is highest. Shorter videos go first so one feature film
 * doesn't hold up a queue of 30-second clips: one step per 5 minutes, capped.
 */
export function priorityFor(durationMs: number): number {
  return 1 + Math.min(20, Math.floor(durationMs / 300_000));
}
