import {PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH} from '@vidflow/shared';
import {betterAuth} from 'better-auth';
import type pg from 'pg';

import type {Env} from './env';

/** Builds the Better Auth instance (email and password) on top of Postgres. */
export function createAuth(env: Env, pool: pg.Pool) {
  return betterAuth({
    database: pool,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.API_URL,
    basePath: '/api/auth',
    trustedOrigins: [env.WEB_URL],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // refresh once a day
    },
    advanced: {
      // Secure cookies need HTTPS, which local development does not have.
      useSecureCookies: env.NODE_ENV === 'production',
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type SessionData = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>;
