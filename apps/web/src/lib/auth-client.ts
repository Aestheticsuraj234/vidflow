import {createAuthClient} from 'better-auth/react';

/** Better Auth client. Talks to the API, which owns the session cookie. */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  basePath: '/api/auth',
});
