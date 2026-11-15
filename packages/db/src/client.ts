import {sql} from 'drizzle-orm';
import {drizzle, type NodePgDatabase} from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  pool: pg.Pool;
}

/** Opens a connection pool and wraps it in a typed Drizzle client. */
export function createDb(databaseUrl: string, maxConnections = 10): DbHandle {
  const pool = new pg.Pool({connectionString: databaseUrl, max: maxConnections});
  const db = drizzle(pool, {schema, casing: 'snake_case'});
  return {db, pool};
}

/** Returns true when the database answers a trivial query. */
export async function isDatabaseUp(db: Database): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
