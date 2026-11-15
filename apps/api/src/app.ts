import {Hono} from 'hono';
import {cors} from 'hono/cors';
import {logger} from 'hono/logger';
import type pg from 'pg';

import type {AppEnv} from './app-env';
import type {Auth} from './auth';
import type {Env} from './env';
import {AppError, type ErrorBody} from './lib/errors';
import {loadSession} from './middleware/session';
import {healthRoutes} from './routes/health';
import {meRoutes} from './routes/me';

export interface AppDeps {
  env: Env;
  pool: pg.Pool;
  auth: Auth;
}

/** Builds the HTTP app. Kept free of `listen()` so tests can call it directly. */
export function createApp({env, pool, auth}: AppDeps) {
  const app = new Hono<AppEnv>();

  if (env.NODE_ENV !== 'test') app.use(logger());

  app.use(
    '*',
    cors({
      origin: env.WEB_URL,
      credentials: true,
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );

  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

  app.route('/health', healthRoutes(pool));

  app.use('/v1/*', loadSession(auth));
  app.route('/v1/me', meRoutes());

  app.notFound((c) => {
    const body: ErrorBody = {error: {code: 'not_found', message: 'Route not found'}};
    return c.json(body, 404);
  });

  app.onError((err, c) => {
    if (err instanceof AppError) {
      const body: ErrorBody = {error: {code: err.code, message: err.message}};
      return c.json(body, err.status);
    }
    console.error(err);
    const body: ErrorBody = {error: {code: 'internal', message: 'Something went wrong'}};
    return c.json(body, 500);
  });

  return app;
}
