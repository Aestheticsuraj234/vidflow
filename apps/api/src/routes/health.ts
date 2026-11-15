import {isDatabaseUp, type Database} from '@vidflow/db';
import type {Pipeline} from '@vidflow/queues';
import type {HealthResponse} from '@vidflow/shared';
import type {StorageProvider} from '@vidflow/storage';
import {Hono} from 'hono';

export const API_VERSION = '0.1.0';

const status = (up: boolean) => (up ? 'ok' : 'down') as 'ok' | 'down';

/** `GET /health`: liveness plus database, storage and Redis checks. */
export function healthRoutes(db: Database, storage: StorageProvider, pipeline: Pipeline) {
  return new Hono().get('/', async (c) => {
    const [database, store, redis] = await Promise.all([
      isDatabaseUp(db),
      storage.isAvailable(),
      pipeline.isAvailable(),
    ]);
    const ok = database && store && redis;
    const body: HealthResponse = {
      status: ok ? 'ok' : 'degraded',
      version: API_VERSION,
      checks: {database: status(database), storage: status(store), redis: status(redis)},
    };
    return c.json(body, ok ? 200 : 503);
  });
}
