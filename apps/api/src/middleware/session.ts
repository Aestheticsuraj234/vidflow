import {createMiddleware} from 'hono/factory';

import type {AppEnv} from '../app-env';
import type {Auth} from '../auth';
import {UnauthorizedError} from '../lib/errors';

/** Loads the session from the request cookies, or sets user/session to null. */
export function loadSession(auth: Auth) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const data = await auth.api.getSession({headers: c.req.raw.headers});
    c.set('user', data?.user ?? null);
    c.set('session', data?.session ?? null);
    await next();
  });
}

/** Rejects the request with 401 unless a user is signed in. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('user')) throw new UnauthorizedError();
  await next();
});
