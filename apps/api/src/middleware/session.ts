import {ApiKeyRepository, schema, type Database} from '@vidflow/db';
import {eq} from 'drizzle-orm';
import {createMiddleware} from 'hono/factory';

import type {AppEnv} from '../app-env';
import type {Auth, SessionData} from '../auth';
import {UnauthorizedError} from '../lib/errors';

/**
 * Identifies the caller: a browser session cookie, or `Authorization: Bearer
 * vf_…` for servers using an API key. Sets user/session to null when neither.
 */
export function loadSession(auth: Auth, db: Database) {
  const keys = new ApiKeyRepository(db);
  return createMiddleware<AppEnv>(async (c, next) => {
    const header = c.req.header('Authorization');
    if (header?.startsWith('Bearer ')) {
      const key = await keys.verify(header.slice(7).trim());
      if (!key) throw new UnauthorizedError('Invalid or revoked API key');
      const [user] = await db.select().from(schema.user).where(eq(schema.user.id, key.userId));
      if (!user) throw new UnauthorizedError('Invalid or revoked API key');
      // Fire and forget: "last used" doesn't need to hold up the request.
      void keys.touch(key.id).catch(() => undefined);
      c.set('user', user as SessionData['user']);
      c.set('session', null);
      c.set('apiKeyId', key.id);
      await next();
      return;
    }
    const data = await auth.api.getSession({headers: c.req.raw.headers});
    c.set('user', data?.user ?? null);
    c.set('session', data?.session ?? null);
    c.set('apiKeyId', null);
    await next();
  });
}

/** Rejects the request with 401 unless a user is signed in. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('user')) throw new UnauthorizedError();
  await next();
});

/** Browser sessions only: API keys can't manage API keys or webhooks. */
export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('user')) throw new UnauthorizedError();
  if (c.get('apiKeyId')) throw new UnauthorizedError('Sign in to manage this');
  await next();
});
