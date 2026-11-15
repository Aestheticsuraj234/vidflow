import type {Metrics} from '@vidflow/observability';
import type {LiveHub, Pipeline} from '@vidflow/queues';
import {Counter, Gauge, Histogram} from 'prom-client';

/** API metrics on top of the shared registry. */
export function createApiMetrics(base: Metrics, pipeline: Pipeline, liveHub: LiveHub) {
  const {registry} = base;
  const requests = new Counter({
    name: 'vidflow_http_requests_total',
    help: 'HTTP requests by method, route pattern and status.',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [registry],
  });
  const duration = new Histogram({
    name: 'vidflow_http_request_duration_seconds',
    help: 'HTTP request latency by route pattern.',
    labelNames: ['method', 'route'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });
  const uploads = new Counter({
    name: 'vidflow_uploads_total',
    help: 'Uploads by outcome (started, completed, rejected).',
    labelNames: ['outcome'] as const,
    registers: [registry],
  });

  // Computed when Prometheus scrapes, so they are always current. Queue depth
  // is the number autoscaling (Chapter 14) and the backlog alert watch.
  new Gauge({
    name: 'vidflow_queue_jobs',
    help: 'Jobs per queue and state.',
    labelNames: ['queue', 'state'] as const,
    registers: [registry],
    async collect() {
      this.reset();
      const counts = await pipeline.counts();
      for (const [queue, states] of Object.entries(counts)) {
        for (const [state, n] of Object.entries(states)) this.set({queue, state}, n);
      }
    },
  });
  new Gauge({
    name: 'vidflow_live_connections',
    help: 'Open server-sent event streams on this API instance.',
    registers: [registry],
    collect() {
      this.set(liveHub.connections);
    },
  });

  return {requests, duration, uploads};
}

export type ApiMetrics = ReturnType<typeof createApiMetrics>;
