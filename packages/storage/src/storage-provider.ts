import type {Readable} from 'node:stream';

export interface ObjectInfo {
  key: string;
  sizeBytes: number;
  contentType: string | null;
  etag: string | null;
}

export interface PutOptions {
  contentType: string;
  /** e.g. `public, max-age=31536000, immutable` for HLS segments. */
  cacheControl?: string;
}

export interface UploadedPart {
  partNumber: number;
  etag: string;
}

/**
 * Everything the services need from object storage. `S3StorageProvider`
 * covers RustFS/MinIO locally and S3 or Cloudflare R2 in production; tests can
 * use another implementation.
 */
export interface StorageProvider {
  /** True if the bucket is reachable with these credentials. */
  isAvailable(): Promise<boolean>;
  put(key: string, body: Buffer | Readable | string, options: PutOptions): Promise<void>;
  /** Uploads a local file, streaming it from disk. */
  putFile(key: string, path: string, options: PutOptions): Promise<void>;
  getStream(key: string): Promise<Readable>;
  getText(key: string): Promise<string>;
  /** Writes an object to a local file. */
  download(key: string, path: string): Promise<void>;
  head(key: string): Promise<ObjectInfo | null>;
  delete(key: string): Promise<void>;
  /** Deletes every object under a prefix. Returns how many were deleted. */
  deletePrefix(prefix: string): Promise<number>;
  list(prefix: string): Promise<string[]>;

  /** A time-limited GET URL for a private object (ffmpeg can read it directly). */
  presignGet(key: string, expiresInSeconds?: number): Promise<string>;
  /** Where a public object is served from (bucket or CDN). */
  publicUrl(key: string): string;

  createMultipartUpload(key: string, contentType: string): Promise<string>;
  /** A URL the browser PUTs one part to; the response's ETag identifies the part. */
  presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresInSeconds?: number,
  ): Promise<string>;
  listParts(key: string, uploadId: string): Promise<UploadedPart[]>;
  completeMultipartUpload(key: string, uploadId: string, parts: UploadedPart[]): Promise<void>;
  abortMultipartUpload(key: string, uploadId: string): Promise<void>;
}
