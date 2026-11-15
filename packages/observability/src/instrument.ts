import type {Metrics} from './metrics';

/** The parts of a BullMQ worker we listen to (kept structural to avoid a dependency). */
interface WorkerLike {
  name: string;
  on(event: 'active', cb: (job: {attemptsMade: number}) => void): unknown;
  on(
    event: 'completed',
    cb: (job: {processedOn?: number; finishedOn?: number}, result: unknown) => void,
  ): unknown;
  on(
    event: 'failed',
    cb: (job: {attemptsMade: number; opts: {attempts?: number}} | undefined, err: Error) => void,
  ): unknown;
  on(event: 'stalled', cb: (jobId: string) => void): unknown;
}

/** Counts, times and tracks a worker's jobs. */
export function instrumentWorker(worker: WorkerLike, metrics: Metrics): void {
  const queue = worker.name;
  metrics.activeJobs.set({queue}, 0);
  worker.on('active', () => metrics.activeJobs.inc({queue}));
  worker.on('completed', (job) => {
    metrics.activeJobs.dec({queue});
    metrics.jobs.inc({queue, outcome: 'completed'});
    if (job.processedOn && job.finishedOn) {
      metrics.jobDuration.observe({queue}, (job.finishedOn - job.processedOn) / 1000);
    }
  });
  worker.on('failed', (job, err) => {
    metrics.activeJobs.dec({queue});
    const final =
      !job || err.name === 'UnrecoverableError' || job.attemptsMade >= (job.opts.attempts ?? 1);
    metrics.jobs.inc({queue, outcome: final ? 'failed' : 'retried'});
  });
  worker.on('stalled', () => metrics.stalled.inc({queue}));
}
