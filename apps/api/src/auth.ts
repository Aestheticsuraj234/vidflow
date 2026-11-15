import {PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH} from '@vidflow/shared';
import {schema, type Database} from '@vidflow/db';
import {betterAuth} from 'better-auth';
import {drizzleAdapter} from 'better-auth/adapters/drizzle';

import type {Env} from './env';

/** Builds the Better Auth instance (email and password) on the Drizzle schema. */
export function createAuth(env: Env, db: Database) {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
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
