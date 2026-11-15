import {createDb, VideoRepository} from '@vidflow/db';
import {createLogger} from '@vidflow/observability';
import {LiveHub, LivePublisher, Pipeline, RateLimiter} from '@vidflow/queues';
import {createStorageFromEnv} from '@vidflow/storage';
import {serve} from '@hono/node-server';

import {createApp} from './app';
import {createAuth} from './auth';
import {loadEnv} from './env';

const env = loadEnv();
const log = createLogger('api');
const {db, pool} = createDb(env.DATABASE_URL);
const auth = createAuth(env, db);
const storage = createStorageFromEnv();
const pipeline = new Pipeline({redisUrl: env.REDIS_URL, prefix: env.QUEUE_PREFIX});
const limiter = new RateLimiter(env.REDIS_URL, env.QUEUE_PREFIX);
const liveHub = new LiveHub({redisUrl: env.REDIS_URL, prefix: env.QUEUE_PREFIX});
const reader = new VideoRepository(db);
const live = new LivePublisher({
  redisUrl: env.REDIS_URL,
  prefix: env.QUEUE_PREFIX,
  load: async (id) => {
    const v = await reader.findById(id);
    return v && {userId: v.userId, status: v.status, progress: v.progress, error: v.error};
  },
});
const app = createApp({
  env,
  db,
  auth,
  storage,
  pipeline,
  liveHub,
  limiter,
  log,
  videoOptions: {onChange: live.videoChanged},
});

const server = serve({fetch: app.fetch, port: env.API_PORT}, (info) => {
  log.info(`Vidflow API listening on http://localhost:${info.port}`);
});

async function shutdown(signal: string) {
  log.info({signal}, 'shutting down');
  server.close();
  await live.close();
  await liveHub.close();
  await limiter.close();
  await pipeline.close();
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
