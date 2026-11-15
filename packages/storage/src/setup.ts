import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketPolicyCommand,
} from '@aws-sdk/client-s3';

import type {S3StorageProvider} from './s3-storage-provider';

export interface BucketSetupOptions {
  /** Origins allowed to upload parts from the browser (the web app). */
  allowedOrigins: string[];
  /**
   * Make `public/*` readable anonymously. True for RustFS/MinIO. False on R2,
   * where you attach a custom domain to the bucket instead.
   */
  publicReadPolicy: boolean;
}

/**
 * Idempotent bucket setup: create it, allow browser uploads (CORS exposing
 * ETag), make `public/*` readable, and abort abandoned multipart uploads.
 */
export async function setupBucket(
  storage: S3StorageProvider,
  {allowedOrigins, publicReadPolicy}: BucketSetupOptions,
): Promise<string[]> {
  const {client, bucket} = storage;
  const done: string[] = [];

  try {
    await client.send(new HeadBucketCommand({Bucket: bucket}));
  } catch {
    await client.send(new CreateBucketCommand({Bucket: bucket}));
    done.push(`created bucket ${bucket}`);
  }

  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: allowedOrigins,
            AllowedMethods: ['GET', 'HEAD', 'PUT'],
            AllowedHeaders: ['*'],
            // The browser must read each part's ETag to complete the upload.
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3600,
          },
          // Players on any site may fetch public HLS and images.
          {AllowedOrigins: ['*'], AllowedMethods: ['GET', 'HEAD'], AllowedHeaders: ['*']},
        ],
      },
    }),
  );
  done.push('CORS set');

  if (publicReadPolicy) {
    await client.send(
      new PutBucketPolicyCommand({
        Bucket: bucket,
        Policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: {AWS: ['*']},
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${bucket}/public/*`],
            },
          ],
        }),
      }),
    );
    done.push('public/* readable');
  }

  await client.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: bucket,
      LifecycleConfiguration: {
        Rules: [
          {
            ID: 'abort-abandoned-uploads',
            Status: 'Enabled',
            Filter: {Prefix: 'sources/'},
            AbortIncompleteMultipartUpload: {DaysAfterInitiation: 1},
          },
        ],
      },
    }),
  );
  done.push('abandoned uploads expire after 1 day');
  return done;
}
