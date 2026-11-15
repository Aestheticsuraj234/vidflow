import type {Webhook, WebhookDelivery, WebhookRepository} from '@vidflow/db';
import type {Pipeline} from '@vidflow/queues';
import {
  createWebhookSchema,
  updateWebhookSchema,
  type CreatedWebhook,
  type WebhookDeliverySummary,
  type WebhookSummary,
} from '@vidflow/shared';
import {Hono} from 'hono';

import type {AppEnv} from '../app-env';
import {NotFoundError, UnauthorizedError, ValidationError} from '../lib/errors';
import {parseBody} from '../lib/validate';
import {requireSession} from '../middleware/session';

const toSummary = (w: Webhook): WebhookSummary => ({
  id: w.id,
  url: w.url,
  events: w.events,
  active: w.active,
  secretHint: `whsec_…${w.secret.slice(-4)}`,
  createdAt: w.createdAt.toISOString(),
});

const toDelivery = (d: WebhookDelivery): WebhookDeliverySummary => ({
  id: d.id,
  event: d.event,
  videoId: d.videoId,
  status: d.status,
  attempts: d.attempts,
  lastStatusCode: d.lastStatusCode,
  lastError: d.lastError,
  createdAt: d.createdAt.toISOString(),
  deliveredAt: d.deliveredAt?.toISOString() ?? null,
});

/** `/v1/webhooks`: manage endpoints, read the delivery log, send a test. */
export function webhookRoutes(
  webhooks: WebhookRepository,
  pipeline: Pipeline,
  {requireHttps}: {requireHttps: boolean},
) {
  const user = (c: {get(k: 'user'): AppEnv['Variables']['user']}) => {
    const u = c.get('user');
    if (!u) throw new UnauthorizedError();
    return u.id;
  };
  const checkUrl = (url: string | undefined) => {
    if (url && requireHttps && !url.startsWith('https://')) {
      throw new ValidationError('Webhook URLs must use https');
    }
  };
  const own = async (id: string, userId: string) => {
    const hook = await webhooks.findForUser(id, userId);
    if (!hook) throw new NotFoundError('Webhook not found');
    return hook;
  };

  return new Hono<AppEnv>()
    .use(requireSession)
    .get('/', async (c) => c.json({webhooks: (await webhooks.listByUser(user(c))).map(toSummary)}))
    .post('/', async (c) => {
      const body = await parseBody(c.req.raw, createWebhookSchema);
      checkUrl(body.url);
      const hook = await webhooks.create({userId: user(c), ...body});
      const res: CreatedWebhook = {...toSummary(hook), secret: hook.secret};
      return c.json(res, 201);
    })
    .patch('/:id', async (c) => {
      const hook = await own(c.req.param('id'), user(c));
      const body = await parseBody(c.req.raw, updateWebhookSchema);
      checkUrl(body.url);
      const updated = await webhooks.update(hook.id, body);
      return c.json(toSummary(updated ?? hook));
    })
    .delete('/:id', async (c) => {
      const hook = await own(c.req.param('id'), user(c));
      await webhooks.delete(hook.id);
      return c.body(null, 204);
    })
    .get('/:id/deliveries', async (c) => {
      const hook = await own(c.req.param('id'), user(c));
      return c.json({deliveries: (await webhooks.listDeliveries(hook.id)).map(toDelivery)});
    })
    .post('/:id/test', async (c) => {
      const hook = await own(c.req.param('id'), user(c));
      const [delivery] = await webhooks.createDeliveries([
        {
          webhookId: hook.id,
          videoId: null,
          event: 'webhook.test',
          payload: {message: 'Hello from Vidflow'},
        },
      ]);
      if (!delivery) throw new Error('Could not create test delivery');
      await pipeline.enqueueDeliveries([delivery.id]);
      return c.json(toDelivery(delivery), 202);
    });
}
