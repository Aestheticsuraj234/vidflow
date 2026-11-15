import {z} from 'zod';

import {S3StorageProvider, type S3Config} from './s3-storage-provider';

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const storageEnvSchema = z.object({
  S3_ENDPOINT: optional(z.url()),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().min(3).default('vidflow'),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  S3_PUBLIC_BASE_URL: z.url(),
});

/** Reads S3_* variables (shared by the API and every worker). */
export function storageConfigFromEnv(source: NodeJS.ProcessEnv = process.env): S3Config {
  const result = storageEnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid storage settings:\n${issues.join('\n')}`);
  }
  const e = result.data;
  return {
    endpoint: e.S3_ENDPOINT,
    region: e.S3_REGION,
    bucket: e.S3_BUCKET,
    accessKeyId: e.S3_ACCESS_KEY_ID,
    secretAccessKey: e.S3_SECRET_ACCESS_KEY,
    forcePathStyle: e.S3_FORCE_PATH_STYLE,
    publicBaseUrl: e.S3_PUBLIC_BASE_URL,
  };
}

export function createStorageFromEnv(source: NodeJS.ProcessEnv = process.env): S3StorageProvider {
  return new S3StorageProvider(storageConfigFromEnv(source));
}
