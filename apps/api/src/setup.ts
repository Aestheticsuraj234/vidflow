/**
 * One-shot production setup, run before the API starts (a Compose service or
 * a Kubernetes Job): database migrations, then bucket CORS/policy/lifecycle.
 * Safe to run on every deploy. Bundled to dist/setup.js.
 */
import {createDb, runMigrations} from '@vidflow/db';
import {createLogger} from '@vidflow/observability';
import {createStorageFromEnv, setupBucket} from '@vidflow/storage';

const log = createLogger('setup');
const url = process.env.DATABASE_URL;
if (!url) {
  log.fatal('DATABASE_URL is required');
  process.exit(1);
}

const {db, pool} = createDb(url, 1);
try {
  await runMigrations(db, process.env.MIGRATIONS_DIR ?? '/app/drizzle');
  log.info('migrations applied');
  const steps = await setupBucket(createStorageFromEnv(), {
    allowedOrigins: (process.env.WEB_URL ?? 'http://localhost:3000').split(','),
    publicReadPolicy: process.env.S3_PUBLIC_READ_POLICY !== 'false',
  });
  log.info({steps}, 'bucket ready');
} catch (err) {
  log.fatal({err}, 'setup failed');
  process.exitCode = 1;
} finally {
  await pool.end();
}
