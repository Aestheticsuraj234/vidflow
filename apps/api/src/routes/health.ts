import {isDatabaseUp, type Database} from '@vidflow/db';
import type {HealthResponse} from '@vidflow/shared';
import type {StorageProvider} from '@vidflow/storage';
import {Hono} from 'hono';

export const API_VERSION = '0.1.0';

/** `GET /health`: liveness plus database and object-storage checks. */
export function healthRoutes(db: Database, storage: StorageProvider) {
  return new Hono().get('/', async (c) => {
    const [dbUp, storageUp] = await Promise.all([isDatabaseUp(db), storage.isAvailable()]);
    const ok = dbUp && storageUp;
    const body: HealthResponse = {
      status: ok ? 'ok' : 'degraded',
      version: API_VERSION,
      checks: {database: dbUp ? 'ok' : 'down', storage: storageUp ? 'ok' : 'down'},
    };
    return c.json(body, ok ? 200 : 503);
  });
}
