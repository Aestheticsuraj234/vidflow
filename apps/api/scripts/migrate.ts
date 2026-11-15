/**
 * Creates or updates the Better Auth tables (user, session, account,
 * verification). Chapter 2 replaces this with Drizzle migrations.
 */
import {getMigrations} from 'better-auth/db/migration';

import {createAuth} from '../src/auth';
import {loadEnv} from '../src/env';
import {createPool} from '../src/lib/db';

const env = loadEnv();
const pool = createPool(env.DATABASE_URL);
const auth = createAuth(env, pool);

const {toBeCreated, toBeAdded, runMigrations} = await getMigrations(auth.options);
if (toBeCreated.length === 0 && toBeAdded.length === 0) {
  console.log('Auth tables are up to date');
} else {
  await runMigrations();
  console.log(`Created ${toBeCreated.length} tables, updated ${toBeAdded.length}`);
}
await pool.end();
