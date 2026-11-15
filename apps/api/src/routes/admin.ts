import {createBullBoard} from '@bull-board/api';
import {BullMQAdapter} from '@bull-board/api/bullMQAdapter';
import {HonoAdapter} from '@bull-board/hono';
import {serveStatic} from '@hono/node-server/serve-static';
import {QUEUE_NAMES, type Pipeline} from '@vidflow/queues';
import {Hono} from 'hono';

import type {AppEnv} from '../app-env';
import {NotFoundError} from '../lib/errors';

export const ADMIN_BASE_PATH = '/admin/queues';

/**
 * Bull Board at `/admin/queues`: browse, retry and clean jobs. Only for
 * signed-in users listed in `ADMIN_EMAILS`; everyone else gets a 404, so the
 * page doesn't advertise itself.
 */
export function adminRoutes(pipeline: Pipeline, adminEmails: string[]) {
  const serverAdapter = new HonoAdapter(serveStatic).setBasePath(ADMIN_BASE_PATH);
  createBullBoard({
    queues: QUEUE_NAMES.map((name) => new BullMQAdapter(pipeline.queue(name))),
    serverAdapter,
    options: {uiConfig: {boardTitle: 'Vidflow queues'}},
  });
  const allowed = new Set(adminEmails.map((e) => e.trim().toLowerCase()).filter(Boolean));

  return new Hono<AppEnv>()
    .use('*', async (c, next) => {
      const email = c.get('user')?.email.toLowerCase();
      if (!email || !allowed.has(email)) throw new NotFoundError('Route not found');
      await next();
    })
    .route('/', serverAdapter.registerPlugin());
}
