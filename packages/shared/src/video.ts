import {z} from 'zod';

export const VIDEO_STATUSES = [
  'created',
  'uploading',
  'uploaded',
  'probing',
  'processing',
  'ready',
  'failed',
  'canceled',
] as const;
export type VideoStatusName = (typeof VIDEO_STATUSES)[number];

/** Container types the pipeline accepts. ffprobe decides what's really inside. */
export const ACCEPTED_VIDEO_TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
  'video/x-msvideo': 'avi',
  'video/mpeg': 'mpeg',
};

/** S3 rules: parts are 5 MiB–5 GiB (last part may be smaller), at most 10,000 parts. */
export const MIN_PART_SIZE = 5 * 1024 * 1024;
export const MAX_PARTS = 10_000;
export const DEFAULT_PART_SIZE = 16 * 1024 * 1024;

/**
 * Picks a part size so the file fits in at most 10,000 parts, rounded up to
 * whole MiB. 16 MiB parts cover files up to about 156 GiB.
 */
export function planParts(
  sizeBytes: number,
  preferred = DEFAULT_PART_SIZE,
): {partSize: number; partCount: number} {
  const mib = 1024 * 1024;
  const needed = Math.ceil(sizeBytes / MAX_PARTS);
  const partSize = Math.max(MIN_PART_SIZE, preferred, Math.ceil(needed / mib) * mib);
  return {partSize, partCount: Math.max(1, Math.ceil(sizeBytes / partSize))};
}

export const createUploadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  fileName: z.string().min(1).max(255),
  contentType: z.string().refine((t) => t in ACCEPTED_VIDEO_TYPES, {
    message: `Unsupported video type. Accepted: ${Object.keys(ACCEPTED_VIDEO_TYPES).join(', ')}`,
  }),
  sizeBytes: z.number().int().positive(),
});
export type CreateUploadRequest = z.infer<typeof createUploadSchema>;

export const signPartsSchema = z.object({
  partNumbers: z.array(z.number().int().min(1).max(MAX_PARTS)).min(1).max(100),
});
export type SignPartsRequest = z.infer<typeof signPartsSchema>;

export const completeUploadSchema = z.object({
  parts: z
    .array(z.object({partNumber: z.number().int().min(1).max(MAX_PARTS), etag: z.string().min(1)}))
    .min(1)
    .max(MAX_PARTS),
});
export type CompleteUploadRequest = z.infer<typeof completeUploadSchema>;

export interface VideoSummary {
  id: string;
  title: string;
  status: VideoStatusName;
  progress: number;
  error: string | null;
  sourceSizeBytes: number | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  readyAt: string | null;
  /** HLS master playlist, once the video is ready. */
  playbackUrl: string | null;
  /** Poster image, once thumbnails are done (they run alongside encoding). */
  posterUrl: string | null;
}

export interface UploadSession {
  uploadId: string;
  partSize: number;
  partCount: number;
}

export interface CreateUploadResponse {
  video: VideoSummary;
  upload: UploadSession;
}

export interface SignPartsResponse {
  parts: {partNumber: number; url: string}[];
}

/** `GET /v1/videos/:id/upload`: what storage already has, for resuming. */
export interface UploadStatusResponse {
  upload: UploadSession;
  uploadedParts: {partNumber: number; etag: string}[];
}

export interface RenditionSummary {
  name: string;
  width: number;
  height: number;
  videoBitrateKbps: number;
  status: 'pending' | 'transcoding' | 'transcoded' | 'packaged' | 'failed';
  progress: number;
  sizeBytes: number | null;
  encodeMs: number | null;
}

export interface TimelineEvent {
  stage: string;
  message: string;
  createdAt: string;
}

/** `GET /v1/videos/:id`: everything the video page shows. */
export interface VideoDetail extends VideoSummary {
  fps: number | null;
  videoCodec: string | null;
  hasAudio: boolean | null;
  renditions: RenditionSummary[];
  /** WebVTT index into the preview sprite, for scrub previews. */
  previewsUrl: string | null;
  events: TimelineEvent[];
}

export interface ApiKeySummary {
  id: string;
  name: string;
  /** First characters only, e.g. `vf_Ab12`. */
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreatedApiKey extends ApiKeySummary {
  key: string;
}
