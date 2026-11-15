/** `pnpm storage:setup`: create and configure the bucket. Safe to re-run. */
import {createStorageFromEnv} from './config';
import {setupBucket} from './setup';

const storage = createStorageFromEnv();
const steps = await setupBucket(storage, {
  allowedOrigins: (process.env.WEB_URL ?? 'http://localhost:3000').split(','),
  publicReadPolicy: process.env.S3_PUBLIC_READ_POLICY !== 'false',
});
console.log(`Bucket ${storage.bucket}: ${steps.join('; ')}`);
