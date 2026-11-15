import {UnrecoverableError, Worker, type Job, type WorkerOptions} from 'bullmq';

import {redisConnection} from './connection';
import {jobSchemas, type JobData, type JobResults, type QueueName} from './contracts';

export interface Log {
  info(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

const consoleLog: Log = {
  info: (obj, msg) => console.log(msg ?? '', JSON.stringify(obj)),
  error: (obj, msg) => console.error(msg ?? '', JSON.stringify(obj)),
};

export type Processor<Q extends QueueName> = (
  data: JobData<Q>,
  job: Job<JobData<Q>, JobResults[Q]>,
) => Promise<JobResults[Q]>;

export interface CreateWorkerOptions extends Partial<Omit<WorkerOptions, 'connection' | 'prefix'>> {
  redisUrl: string;
  prefix?: string;
  log?: Log;
}

/**
 * A typed worker for one stage. Data is validated before the processor runs;
 * malformed data can't succeed on retry, so it fails the job immediately.
 */
export function createWorker<Q extends QueueName>(
  queue: Q,
  processor: Processor<Q>,
  {redisUrl, prefix = 'vidflow', log = consoleLog, ...options}: CreateWorkerOptions,
): Worker<JobData<Q>, JobResults[Q]> {
  const worker = new Worker<JobData<Q>, JobResults[Q]>(
    queue,
    async (job) => {
      const parsed = jobSchemas[queue].safeParse(job.data);
      if (!parsed.success) {
        throw new UnrecoverableError(`Invalid ${queue} job data: ${parsed.error.message}`);
      }
      return processor(parsed.data as JobData<Q>, job);
    },
    {connection: redisConnection(redisUrl), prefix, ...options},
  );

  worker.on('active', (job) =>
    log.info({queue, jobId: job.id, attempt: job.attemptsMade + 1}, 'job started'),
  );
  worker.on('completed', (job) =>
    log.info(
      {queue, jobId: job.id, ms: (job.finishedOn ?? 0) - (job.processedOn ?? 0)},
      'job completed',
    ),
  );
  worker.on('failed', (job, err) =>
    log.error({queue, jobId: job?.id, attempt: job?.attemptsMade, err: err.message}, 'job failed'),
  );
  worker.on('error', (err) => log.error({queue, err: err.message}, 'worker error'));
  return worker;
}

/**
 * Stop taking new jobs, let active ones finish (BullMQ waits for them), then
 * clean up. Kubernetes sends SIGTERM and waits `terminationGracePeriodSeconds`.
 */
export function shutdownOnSignal(
  workers: Worker[],
  cleanup: () => Promise<void> = async () => undefined,
  log: Log = consoleLog,
): void {
  let closing = false;
  const stop = async (signal: string) => {
    if (closing) return;
    closing = true;
    log.info({signal}, 'shutting down');
    await Promise.all(workers.map((w) => w.close()));
    await cleanup();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop('SIGINT'));
  process.on('SIGTERM', () => void stop('SIGTERM'));
}
