import {EventEmitter} from 'node:events';
import type {AddressInfo} from 'node:net';

import {describe, expect, it} from 'vitest';

import {createMetrics, instrumentWorker, startMetricsServer} from './index';

class FakeWorker extends EventEmitter {
  name = 'transcode';
}

describe('instrumentWorker', () => {
  it('counts outcomes, times jobs and tracks active jobs', async () => {
    const metrics = createMetrics('test');
    const worker = new FakeWorker();
    instrumentWorker(worker as never, metrics);

    worker.emit('active', {attemptsMade: 0});
    worker.emit('active', {attemptsMade: 0});
    worker.emit('completed', {processedOn: 1000, finishedOn: 4000}, {});
    worker.emit('failed', {attemptsMade: 1, opts: {attempts: 3}}, new Error('flaky'));
    worker.emit('active', {attemptsMade: 1});
    worker.emit('failed', {attemptsMade: 3, opts: {attempts: 3}}, new Error('dead'));
    worker.emit('stalled', 'job-1');

    const text = await metrics.registry.metrics();
    expect(text).toContain(
      'vidflow_jobs_total{queue="transcode",outcome="completed",service="test"} 1',
    );
    expect(text).toContain(
      'vidflow_jobs_total{queue="transcode",outcome="retried",service="test"} 1',
    );
    expect(text).toContain(
      'vidflow_jobs_total{queue="transcode",outcome="failed",service="test"} 1',
    );
    expect(text).toContain('vidflow_jobs_active{queue="transcode",service="test"} 0');
    expect(text).toContain('vidflow_job_duration_seconds_sum{service="test",queue="transcode"} 3');
    expect(text).toContain('vidflow_jobs_stalled_total{queue="transcode",service="test"} 1');
  });
});

describe('startMetricsServer', () => {
  it('serves /metrics and a health probe', async () => {
    const metrics = createMetrics('svc');
    let healthy = true;
    const server = startMetricsServer(0, metrics.registry, () => healthy);
    await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    expect(await (await fetch(`${base}/metrics`)).text()).toContain(
      'vidflow_process_cpu_seconds_total',
    );
    expect((await fetch(`${base}/health`)).status).toBe(200);
    healthy = false;
    expect((await fetch(`${base}/health`)).status).toBe(503);
    server.close();
  });

  it('reports a busy port instead of crashing', async () => {
    const metrics = createMetrics('svc');
    const first = startMetricsServer(0, metrics.registry);
    await new Promise((r) => first.once('listening', r));
    const port = (first.address() as AddressInfo).port;
    const err = await new Promise<Error>((resolve) =>
      startMetricsServer(port, metrics.registry, () => true, resolve),
    );
    expect(err.message).toMatch(/EADDRINUSE/);
    first.close();
  });
});
