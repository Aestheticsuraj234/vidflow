import type {PublicUser} from '@vidflow/shared';
import {Hono} from 'hono';

import type {AppEnv} from '../app-env';
import {UnauthorizedError} from '../lib/errors';
import {requireUser} from '../middleware/session';

/** `GET /v1/me`: the signed-in user. */
export function meRoutes() {
  return new Hono<AppEnv>().get('/', requireUser, (c) => {
    const user = c.get('user');
    if (!user) throw new UnauthorizedError();
    const body: PublicUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
    };
    return c.json(body);
  });
}
