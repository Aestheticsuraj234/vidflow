import {afterAll, expect, it} from 'vitest';

import {env, makeTestApp, signUp} from './helpers';

const t = makeTestApp();
afterAll(() => t.close());

it('exposes request, queue and connection metrics', async () => {
  const headers = await signUp(t.app);
  await t.app.request('/v1/videos/6f1c2c62-6a7e-4d33-9a8e-000000000000', {headers});
  await t.pipeline.enqueueProbe('6f1c2c62-6a7e-4d33-9a8e-4c4c4c4c4c4c');
  const text = await (await t.app.request('/metrics')).text();
  expect(text).toMatch(
    /vidflow_http_requests_total\{method="GET",route="\/v1\/videos\/:id",status="404",service="api"\} 1/,
  );
  expect(text).toContain('vidflow_queue_jobs{queue="probe",state="waiting",service="api"} 1');
  expect(text).toContain('vidflow_live_connections{service="api"} 0');
});

it('can require a token', async () => {
  const locked = makeTestApp({env: {...env, METRICS_TOKEN: 's3cret'}});
  expect((await locked.app.request('/metrics')).status).toBe(401);
  expect(
    (await locked.app.request('/metrics', {headers: {Authorization: 'Bearer s3cret'}})).status,
  ).toBe(200);
  await locked.close();
});
