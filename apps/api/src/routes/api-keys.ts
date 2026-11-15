import type {ApiKey, ApiKeyRepository} from '@vidflow/db';
import type {ApiKeySummary, CreatedApiKey} from '@vidflow/shared';
import {Hono} from 'hono';
import {z} from 'zod';

import type {AppEnv} from '../app-env';
import {NotFoundError, UnauthorizedError} from '../lib/errors';
import {parseBody} from '../lib/validate';
import {requireSession} from '../middleware/session';

const toSummary = (k: ApiKey): ApiKeySummary => ({
  id: k.id,
  name: k.name,
  prefix: k.prefix,
  lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
  createdAt: k.createdAt.toISOString(),
});

/** `/v1/api-keys`: keys for uploading from your own servers. Session only. */
export function apiKeyRoutes(keys: ApiKeyRepository) {
  const user = (c: {get(k: 'user'): AppEnv['Variables']['user']}) => {
    const u = c.get('user');
    if (!u) throw new UnauthorizedError();
    return u.id;
  };
  return new Hono<AppEnv>()
    .use(requireSession)
    .get('/', async (c) => c.json({apiKeys: (await keys.listByUser(user(c))).map(toSummary)}))
    .post('/', async (c) => {
      const {name} = await parseBody(
        c.req.raw,
        z.object({name: z.string().trim().min(1).max(100)}),
      );
      const {key, apiKey} = await keys.create(user(c), name);
      const res: CreatedApiKey = {...toSummary(apiKey), key};
      return c.json(res, 201);
    })
    .delete('/:id', async (c) => {
      if (!(await keys.revoke(c.req.param('id'), user(c))))
        throw new NotFoundError('API key not found');
      return c.body(null, 204);
    });
}
