import {
  ApiKeyRepository,
  VideoRepository,
  WebhookRepository,
  type Database,
  type VideoRepositoryOptions,
} from '@vidflow/db';
import {createLogger, createMetrics, type Logger, type Metrics} from '@vidflow/observability';
import type {LiveHub, Pipeline, RateLimiter} from '@vidflow/queues';
import type {StorageProvider} from '@vidflow/storage';
import {Hono} from 'hono';
import {cors} from 'hono/cors';

import type {AppEnv} from './app-env';
import type {Auth} from './auth';
import type {Env} from './env';
import {createApiMetrics} from './lib/metrics';
import {AppError, TooManyRequestsError, type ErrorBody} from './lib/errors';
import {loadSession} from './middleware/session';
import {ADMIN_BASE_PATH, adminRoutes} from './routes/admin';
import {apiKeyRoutes} from './routes/api-keys';
import {healthRoutes} from './routes/health';
import {liveRoutes} from './routes/live';
import {meRoutes} from './routes/me';
import {videoRoutes} from './routes/videos';
import {webhookRoutes} from './routes/webhooks';
import {UploadService} from './services/upload-service';

export interface AppDeps {
  env: Env;
  db: Database;
  auth: Auth;
  storage: StorageProvider;
  pipeline: Pipeline;
  /** Fans live updates out to SSE connections. */
  liveHub: LiveHub;
  limiter: RateLimiter;
  log?: Logger;
  metrics?: Metrics;
  /** Publishes the API's own video changes (uploads) live. */
  videoOptions?: VideoRepositoryOptions;
}

/** Builds the HTTP app. Kept free of `listen()` so tests can call it directly. */
export function createApp({
  env,
  db,
  auth,
  storage,
  pipeline,
  liveHub,
  limiter,
  videoOptions,
  log = createLogger('api', env.NODE_ENV === 'test' ? 'silent' : undefined),
  metrics = createMetrics('api'),
}: AppDeps) {
  const app = new Hono<AppEnv>();
  const apiMetrics = createApiMetrics(metrics, pipeline, liveHub);
  const videos = new VideoRepository(db, videoOptions);
  const uploads = new UploadService(videos, storage, {
    maxUploadBytes: env.MAX_UPLOAD_BYTES,
    // Abuse limits: uploads per hour, and videos in the pipeline at once.
    beforeCreate: async (userId) => {
      const hourly = await limiter.hit(`uploads:${userId}`, env.UPLOADS_PER_HOUR, 3600);
      if (!hourly.allowed) {
        apiMetrics.uploads.inc({outcome: 'rejected'});
        throw new TooManyRequestsError(
          `Upload limit reached (${env.UPLOADS_PER_HOUR} per hour)`,
          hourly.retryAfterSec,
        );
      }
      if ((await videos.countActive(userId)) >= env.MAX_ACTIVE_VIDEOS) {
        throw new TooManyRequestsError(
          `${env.MAX_ACTIVE_VIDEOS} videos are already processing; try again when one finishes`,
          60,
        );
      }
    },
    // The upload is done: hand the video to the pipeline.
    onUploaded: async (video) => {
      await pipeline.enqueueProbe(video.id);
      await videos.addEvent(video.id, 'queue', 'Queued for probing');
      await pipeline.enqueueNotify(video.id, video.userId, 'video.uploaded');
      apiMetrics.uploads.inc({outcome: 'completed'});
    },
  });

  // One structured log line and two metrics per request. The route label is
  // the pattern (`/v1/videos/:id`), never the raw path, to keep cardinality low.
  app.use('*', async (c, next) => {
    const start = performance.now();
    await next();
    const route = c.req.routePath || 'unmatched';
    if (route === '/metrics' || route === '/health') return;
    const seconds = (performance.now() - start) / 1000;
    const status = String(c.res.status);
    apiMetrics.requests.inc({method: c.req.method, route, status});
    apiMetrics.duration.observe({method: c.req.method, route}, seconds);
    log.info(
      {
        method: c.req.method,
        path: c.req.path,
        route,
        status: c.res.status,
        ms: Math.round(seconds * 1000),
      },
      'request',
    );
  });

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

  // Prometheus. Behind METRICS_TOKEN when set (it's on the public API port).
  app.get('/metrics', async (c) => {
    if (env.METRICS_TOKEN && c.req.header('Authorization') !== `Bearer ${env.METRICS_TOKEN}`) {
      return c.body(null, 401);
    }
    return c.body(await metrics.registry.metrics(), 200, {
      'Content-Type': metrics.registry.contentType,
    });
  });

  app.use('/v1/*', loadSession(auth, db));
  app.route('/v1/me', meRoutes());
  app.route('/v1/videos', videoRoutes(videos, uploads, storage, pipeline));
  app.route('/v1/live', liveRoutes(liveHub));
  app.route('/v1/api-keys', apiKeyRoutes(new ApiKeyRepository(db)));
  app.use(`${ADMIN_BASE_PATH}/*`, loadSession(auth, db));
  app.use(ADMIN_BASE_PATH, loadSession(auth, db));
  app.route(ADMIN_BASE_PATH, adminRoutes(pipeline, env.ADMIN_EMAILS));
  app.route(
    '/v1/webhooks',
    webhookRoutes(new WebhookRepository(db), pipeline, {
      requireHttps: env.NODE_ENV === 'production',
    }),
  );

  app.notFound((c) => {
    const body: ErrorBody = {error: {code: 'not_found', message: 'Route not found'}};
    return c.json(body, 404);
  });

  app.onError((err, c) => {
    if (err instanceof TooManyRequestsError && err.retryAfterSec) {
      c.header('Retry-After', String(err.retryAfterSec));
    }
    if (err instanceof AppError) {
      const body: ErrorBody = {error: {code: err.code, message: err.message}};
      return c.json(body, err.status);
    }
    log.error({err, path: c.req.path}, 'unhandled error');
    const body: ErrorBody = {error: {code: 'internal', message: 'Something went wrong'}};
    return c.json(body, 500);
  });

  return app;
}
