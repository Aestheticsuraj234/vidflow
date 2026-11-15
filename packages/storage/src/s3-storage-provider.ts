import {createReadStream, createWriteStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';

import type {ObjectInfo, PutOptions, StorageProvider, UploadedPart} from './storage-provider';

export interface S3Config {
  /** Omit for AWS S3; set for RustFS, MinIO or R2 (`https://<account>.r2.cloudflarestorage.com`). */
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Path-style URLs (`host/bucket/key`); needed for RustFS and MinIO. */
  forcePathStyle: boolean;
  /** Base URL that serves `public/…` keys: the bucket, a CDN, or an R2 custom domain. */
  publicBaseUrl: string;
  /**
   * Endpoint browsers use for presigned part uploads, when it differs from
   * `endpoint` (self-hosted storage: services use `http://storage:9000`,
   * browsers `https://media.example.com`). The signature covers the host, so
   * the URL must be signed for the host the browser will call.
   */
  presignEndpoint?: string;
}

/** S3-compatible storage: RustFS/MinIO locally, S3 or Cloudflare R2 in production. */
export class S3StorageProvider implements StorageProvider {
  readonly client: S3Client;
  /** Signs browser-facing URLs; the same client unless `presignEndpoint` is set. */
  private readonly browserClient: S3Client;
  readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    this.publicBaseUrl = config.publicBaseUrl.replace(/\/+$/, '');
    const makeClient = (endpoint: string | undefined) =>
      new S3Client({
        endpoint,
        region: config.region,
        forcePathStyle: config.forcePathStyle,
        credentials: {accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey},
        // The SDK's default checksums break presigned part uploads on R2,
        // RustFS and MinIO. Only send them where the API requires them.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      });
    this.client = makeClient(config.endpoint);
    this.browserClient = config.presignEndpoint ? makeClient(config.presignEndpoint) : this.client;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({Bucket: this.bucket}));
      return true;
    } catch {
      return false;
    }
  }

  async put(key: string, body: Buffer | Readable | string, options: PutOptions): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: options.contentType,
        CacheControl: options.cacheControl,
      }),
    );
  }

  async putFile(key: string, path: string, options: PutOptions): Promise<void> {
    const {size} = await stat(path);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(path),
        ContentLength: size,
        ContentType: options.contentType,
        CacheControl: options.cacheControl,
      }),
    );
  }

  async getStream(key: string): Promise<Readable> {
    const res = await this.client.send(new GetObjectCommand({Bucket: this.bucket, Key: key}));
    if (!(res.Body instanceof Readable)) throw new Error(`No body for ${key}`);
    return res.Body;
  }

  async getText(key: string): Promise<string> {
    const res = await this.client.send(new GetObjectCommand({Bucket: this.bucket, Key: key}));
    if (!res.Body) throw new Error(`No body for ${key}`);
    return res.Body.transformToString('utf8');
  }

  async download(key: string, path: string): Promise<void> {
    await pipeline(await this.getStream(key), createWriteStream(path));
  }

  async head(key: string): Promise<ObjectInfo | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({Bucket: this.bucket, Key: key}));
      return {
        key,
        sizeBytes: res.ContentLength ?? 0,
        contentType: res.ContentType ?? null,
        etag: res.ETag ?? null,
      };
    } catch (err) {
      if (err instanceof NotFound || (err as {name?: string}).name === 'NotFound') return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({Bucket: this.bucket, Key: key}));
  }

  async deletePrefix(prefix: string): Promise<number> {
    if (!prefix.endsWith('/')) throw new Error('deletePrefix needs a prefix ending in "/"');
    const keys = await this.list(prefix);
    // DeleteObjects takes at most 1000 keys per call.
    for (let i = 0; i < keys.length; i += 1000) {
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {Objects: keys.slice(i, i + 1000).map((Key) => ({Key})), Quiet: true},
        }),
      );
    }
    return keys.length;
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({Bucket: this.bucket, Prefix: prefix, ContinuationToken: token}),
      );
      for (const obj of res.Contents ?? []) if (obj.Key) keys.push(obj.Key);
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }

  presignGet(key: string, expiresInSeconds = 3600): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({Bucket: this.bucket, Key: key}), {
      expiresIn: expiresInSeconds,
    });
  }

  publicUrl(key: string): string {
    if (!key.startsWith('public/')) throw new Error(`${key} is not a public key`);
    return `${this.publicBaseUrl}/${key}`;
  }

  async createMultipartUpload(key: string, contentType: string): Promise<string> {
    const res = await this.client.send(
      new CreateMultipartUploadCommand({Bucket: this.bucket, Key: key, ContentType: contentType}),
    );
    if (!res.UploadId) throw new Error('Storage did not return an upload ID');
    return res.UploadId;
  }

  presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresInSeconds = 3600,
  ): Promise<string> {
    return getSignedUrl(
      this.browserClient,
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      }),
      {expiresIn: expiresInSeconds},
    );
  }

  async listParts(key: string, uploadId: string): Promise<UploadedPart[]> {
    const parts: UploadedPart[] = [];
    let marker: string | undefined;
    do {
      const res = await this.client.send(
        new ListPartsCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumberMarker: marker,
        }),
      );
      for (const p of res.Parts ?? []) {
        if (p.PartNumber && p.ETag) parts.push({partNumber: p.PartNumber, etag: p.ETag});
      }
      marker = res.IsTruncated ? res.NextPartNumberMarker : undefined;
    } while (marker);
    return parts;
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: UploadedPart[],
  ): Promise<void> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: [...parts]
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((p) => ({PartNumber: p.partNumber, ETag: p.etag})),
        },
      }),
    );
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({Bucket: this.bucket, Key: key, UploadId: uploadId}),
    );
  }
}
