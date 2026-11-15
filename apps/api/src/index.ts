import {createDb} from '@vidflow/db';
import {createStorageFromEnv} from '@vidflow/storage';
import {serve} from '@hono/node-server';

import {createApp} from './app';
import {createAuth} from './auth';
import {loadEnv} from './env';

const env = loadEnv();
const {db, pool} = createDb(env.DATABASE_URL);
const auth = createAuth(env, db);
const storage = createStorageFromEnv();
const app = createApp({env, db, auth, storage});

const server = serve({fetch: app.fetch, port: env.API_PORT}, (info) => {
  console.log(`Vidflow API listening on http://localhost:${info.port}`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close();
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
