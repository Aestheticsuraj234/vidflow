import type {Video, VideoRepository} from '@vidflow/db';
import {
  ACCEPTED_VIDEO_TYPES,
  planParts,
  type CompleteUploadRequest,
  type CreateUploadRequest,
  type UploadSession,
} from '@vidflow/shared';
import {keys, type StorageProvider, type UploadedPart} from '@vidflow/storage';

import {ConflictError, NotFoundError, PayloadTooLargeError, ValidationError} from '../lib/errors';

export interface UploadServiceOptions {
  maxUploadBytes: number;
  /** How long a presigned part URL stays valid. */
  partUrlTtlSeconds?: number;
  /** Runs after an upload completes; Chapter 5 starts the pipeline here. */
  onUploaded?: (video: Video) => Promise<void>;
}

/**
 * Direct-to-storage uploads. The API only creates the multipart upload, signs
 * part URLs and completes it; the bytes go from the browser to the bucket.
 */
export class UploadService {
  constructor(
    private readonly videos: VideoRepository,
    private readonly storage: StorageProvider,
    private readonly options: UploadServiceOptions,
  ) {}

  async create(
    userId: string,
    req: CreateUploadRequest,
  ): Promise<{video: Video; upload: UploadSession}> {
    if (req.sizeBytes > this.options.maxUploadBytes) {
      throw new PayloadTooLargeError(
        `Files can be at most ${Math.floor(this.options.maxUploadBytes / 1024 ** 2)} MiB`,
      );
    }
    const created = await this.videos.create({
      userId,
      title: req.title,
      sourceSizeBytes: req.sizeBytes,
      sourceContentType: req.contentType,
    });
    const sourceKey = keys.source(created.id, ACCEPTED_VIDEO_TYPES[req.contentType] ?? 'bin');
    const uploadId = await this.storage.createMultipartUpload(sourceKey, req.contentType);
    const video = await this.videos.transition(created.id, 'uploading', {sourceKey, uploadId});
    if (!video) throw new ConflictError('Video changed while starting the upload');
    await this.videos.addEvent(video.id, 'upload', 'Upload started');
    return {video, upload: this.session(video)};
  }

  /** Session details plus the parts storage already has, so a client can resume. */
  async status(
    userId: string,
    videoId: string,
  ): Promise<{upload: UploadSession; uploadedParts: UploadedPart[]}> {
    const video = await this.uploading(userId, videoId);
    const uploadedParts = await this.storage.listParts(this.sourceKey(video), this.uploadId(video));
    return {upload: this.session(video), uploadedParts};
  }

  async signParts(userId: string, videoId: string, partNumbers: number[]) {
    const video = await this.uploading(userId, videoId);
    const {partCount} = this.session(video);
    const outOfRange = partNumbers.find((n) => n > partCount);
    if (outOfRange)
      throw new ValidationError(`Part ${outOfRange} is past the last part (${partCount})`);
    const parts = await Promise.all(
      [...new Set(partNumbers)].map(async (partNumber) => ({
        partNumber,
        url: await this.storage.presignUploadPart(
          this.sourceKey(video),
          this.uploadId(video),
          partNumber,
          this.options.partUrlTtlSeconds ?? 3600,
        ),
      })),
    );
    return {parts};
  }

  async complete(userId: string, videoId: string, req: CompleteUploadRequest): Promise<Video> {
    const video = await this.uploading(userId, videoId);
    const {partCount} = this.session(video);
    const numbers = new Set(req.parts.map((p) => p.partNumber));
    if (numbers.size !== partCount || [...numbers].some((n) => n > partCount)) {
      throw new ValidationError(`Expected ${partCount} distinct parts, got ${numbers.size}`);
    }
    const key = this.sourceKey(video);
    await this.storage.completeMultipartUpload(key, this.uploadId(video), req.parts);

    // Trust storage, not the client: the object must be exactly the declared size.
    const head = await this.storage.head(key);
    if (!head || head.sizeBytes !== video.sourceSizeBytes) {
      await this.storage.delete(key);
      await this.videos.transition(video.id, 'failed', {error: 'Uploaded size did not match'});
      throw new ValidationError(
        `Uploaded ${head?.sizeBytes ?? 0} bytes, expected ${video.sourceSizeBytes}`,
      );
    }

    const uploaded = await this.videos.transition(video.id, 'uploaded', {
      uploadId: null,
      uploadedAt: new Date(),
    });
    if (!uploaded) throw new ConflictError('Upload was canceled');
    await this.videos.addEvent(video.id, 'upload', 'Upload complete');
    await this.options.onUploaded?.(uploaded);
    return uploaded;
  }

  async abort(userId: string, videoId: string): Promise<Video> {
    const video = await this.uploading(userId, videoId);
    await this.storage.abortMultipartUpload(this.sourceKey(video), this.uploadId(video));
    const canceled = await this.videos.transition(video.id, 'canceled', {uploadId: null});
    if (!canceled) throw new ConflictError('Upload already finished');
    await this.videos.addEvent(video.id, 'upload', 'Upload canceled');
    return canceled;
  }

  private async uploading(userId: string, videoId: string): Promise<Video> {
    const video = await this.videos.findForUser(videoId, userId);
    if (!video) throw new NotFoundError('Video not found');
    if (video.status !== 'uploading' || !video.uploadId) {
      throw new ConflictError(`Video is ${video.status}, not uploading`);
    }
    return video;
  }

  /** Derived from the declared size, so it's identical every time the client asks. */
  private session(video: Video): UploadSession {
    const {partSize, partCount} = planParts(video.sourceSizeBytes ?? 0);
    return {uploadId: this.uploadId(video), partSize, partCount};
  }

  private sourceKey(video: Video): string {
    if (!video.sourceKey) throw new Error(`Video ${video.id} has no source key`);
    return video.sourceKey;
  }

  private uploadId(video: Video): string {
    if (!video.uploadId) throw new Error(`Video ${video.id} has no upload`);
    return video.uploadId;
  }
}
