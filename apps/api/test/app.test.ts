import {randomUUID} from 'node:crypto';

import type {HealthResponse, PublicUser} from '@vidflow/shared';
import {afterAll, describe, expect, it} from 'vitest';

import {createApp} from '../src/app';
import {createAuth} from '../src/auth';
import {loadEnv} from '../src/env';
import {createPool} from '../src/lib/db';
import type {ErrorBody} from '../src/lib/errors';

const env = loadEnv({
  ...process.env,
  NODE_ENV: 'test',
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? 'test-secret-test-secret-test-secret-12',
});
const pool = createPool(env.DATABASE_URL);
const auth = createAuth(env, pool);
const app = createApp({env, pool, auth});

const origin = {Origin: env.WEB_URL};

afterAll(async () => {
  await pool.end();
});

function sessionCookie(res: Response): string {
  const cookie = res.headers.getSetCookie().find((c) => c.includes('session_token'));
  if (!cookie) throw new Error('No session cookie in response');
  return cookie.split(';')[0] ?? '';
}

describe('GET /health', () => {
  it('reports the database as up', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthResponse;
    expect(body).toMatchObject({status: 'ok', checks: {database: 'ok'}});
  });

  it('returns 503 when the database is unreachable', async () => {
    const deadPool = createPool('postgres://postgres@127.0.0.1:1/none');
    const deadApp = createApp({env, pool: deadPool, auth});
    const res = await deadApp.request('/health');
    expect(res.status).toBe(503);
    const body = (await res.json()) as HealthResponse;
    expect(body).toMatchObject({status: 'degraded', checks: {database: 'down'}});
    await deadPool.end();
  });
});

describe('auth flow', () => {
  const email = `user-${randomUUID()}@test.dev`;
  const password = 'password123';

  it('signs up and returns a session cookie', async () => {
    const res = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', ...origin},
      body: JSON.stringify({name: 'Test User', email, password}),
    });
    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toContain('session_token=');
  });

  it('rejects a wrong password', async () => {
    const res = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', ...origin},
      body: JSON.stringify({email, password: 'wrong-password'}),
    });
    expect(res.status).toBe(401);
  });

  it('signs in and reads /v1/me with the cookie', async () => {
    const signIn = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', ...origin},
      body: JSON.stringify({email, password}),
    });
    expect(signIn.status).toBe(200);

    const me = await app.request('/v1/me', {headers: {Cookie: sessionCookie(signIn)}});
    expect(me.status).toBe(200);
    const user = (await me.json()) as PublicUser;
    expect(user).toMatchObject({email, name: 'Test User'});
  });

  it('returns 401 from /v1/me without a session', async () => {
    const res = await app.request('/v1/me');
    expect(res.status).toBe(401);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe('unauthorized');
  });
});

describe('unknown routes', () => {
  it('returns a JSON 404', async () => {
    const res = await app.request('/nope');
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe('not_found');
  });
});
