import {Counter, Gauge, Histogram, Registry, collectDefaultMetrics} from 'prom-client';

/**
 * One registry per process. Every metric is prefixed `vidflow_` and labelled
 * with `service` by default, so one Prometheus can scrape every service.
 */
export function createMetrics(service: string) {
  const registry = new Registry();
  registry.setDefaultLabels({service});
  collectDefaultMetrics({register: registry, prefix: 'vidflow_'});

  const jobs = new Counter({
    name: 'vidflow_jobs_total',
    help: 'Jobs finished, by queue and outcome (completed, failed, retried).',
    labelNames: ['queue', 'outcome'] as const,
    registers: [registry],
  });
  const jobDuration = new Histogram({
    name: 'vidflow_job_duration_seconds',
    help: 'Wall time of completed jobs.',
    labelNames: ['queue'] as const,
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600, 1800, 3600],
    registers: [registry],
  });
  const activeJobs = new Gauge({
    name: 'vidflow_jobs_active',
    help: 'Jobs this process is working on right now.',
    labelNames: ['queue'] as const,
    registers: [registry],
  });
  const encodeSpeed = new Histogram({
    name: 'vidflow_encode_speed_ratio',
    help: 'Seconds of video encoded per second of wall time (2 = twice realtime).',
    labelNames: ['rendition'] as const,
    buckets: [0.25, 0.5, 1, 2, 4, 8, 16, 32],
    registers: [registry],
  });
  const stalled = new Counter({
    name: 'vidflow_jobs_stalled_total',
    help: 'Jobs found stalled (their worker died) and put back in the queue.',
    labelNames: ['queue'] as const,
    registers: [registry],
  });

  return {registry, jobs, jobDuration, activeJobs, encodeSpeed, stalled};
}

export type Metrics = ReturnType<typeof createMetrics>;
