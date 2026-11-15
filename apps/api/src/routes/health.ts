import type {HealthResponse} from '@vidflow/shared';
import {Hono} from 'hono';
import type pg from 'pg';

import {isDatabaseUp} from '../lib/db';

export const API_VERSION = '0.1.0';

/** `GET /health`: liveness plus a database check. */
export function healthRoutes(pool: pg.Pool) {
  return new Hono().get('/', async (c) => {
    const dbUp = await isDatabaseUp(pool);
    const body: HealthResponse = {
      status: dbUp ? 'ok' : 'degraded',
      version: API_VERSION,
      checks: {database: dbUp ? 'ok' : 'down'},
    };
    return c.json(body, dbUp ? 200 : 503);
  });
}
