import pg from 'pg';

/** Creates the shared Postgres connection pool. */
export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({connectionString: databaseUrl, max: 10});
}

/** Returns true when the database answers a trivial query. */
export async function isDatabaseUp(pool: pg.Pool): Promise<boolean> {
  try {
    await pool.query('select 1');
    return true;
  } catch {
    return false;
  }
}
