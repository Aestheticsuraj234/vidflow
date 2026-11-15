import {migrate} from 'drizzle-orm/node-postgres/migrator';

import type {Database} from './client';

/** Applies pending migrations from `folder` (the `drizzle/` directory). */
export async function runMigrations(db: Database, migrationsFolder: string): Promise<void> {
  await migrate(db, {migrationsFolder});
}
