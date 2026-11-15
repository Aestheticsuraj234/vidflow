import {VideoRepository, type Database} from '@vidflow/db';
import type {Pipeline} from '@vidflow/queues';
import type {StorageProvider} from '@vidflow/storage';
import {Hono} from 'hono';
import {cors} from 'hono/cors';
import {logger} from 'hono/logger';

import type {AppEnv} from './app-env';
import type {Auth} from './auth';
import type {Env} from './env';
import {AppError, type ErrorBody} from './lib/errors';
import {loadSession} from './middleware/session';
import {healthRoutes} from './routes/health';
import {meRoutes} from './routes/me';
import {videoRoutes} from './routes/videos';
import {UploadService} from './services/upload-service';

export interface AppDeps {
  env: Env;
  db: Database;
  auth: Auth;
  storage: StorageProvider;
  pipeline: Pipeline;
}

/** Builds the HTTP app. Kept free of `listen()` so tests can call it directly. */
export function createApp({env, db, auth, storage, pipeline}: AppDeps) {
  const app = new Hono<AppEnv>();
  const videos = new VideoRepository(db);
  const uploads = new UploadService(videos, storage, {
    maxUploadBytes: env.MAX_UPLOAD_BYTES,
    // The upload is done: hand the video to the pipeline.
    onUploaded: async (video) => {
      await pipeline.enqueueProbe(video.id);
      await videos.addEvent(video.id, 'queue', 'Queued for probing');
    },
  });

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

  app.route('/health', healthRoutes(db, storage, pipeline));

  app.use('/v1/*', loadSession(auth));
  app.route('/v1/me', meRoutes());
  app.route('/v1/videos', videoRoutes(videos, uploads));

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
