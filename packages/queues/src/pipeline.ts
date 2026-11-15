import {FlowProducer, Queue, type DefaultJobOptions, type FlowJob, type JobsOptions} from 'bullmq';

import {
  jobIds,
  priorityFor,
  QUEUE_NAMES,
  type JobData,
  type JobResults,
  type QueueName,
  type RenditionSpec,
  type WebhookEvent,
} from './contracts';
import {redisConnection} from './connection';

export interface PipelineOptions {
  redisUrl: string;
  /** Redis key prefix; tests use their own so they never touch real queues. */
  prefix?: string;
  /** Connection errors. Without a listener Node would treat them as crashes. */
  onError?: (err: Error) => void;
}

/** Retries with exponential backoff; finished jobs kept long enough to inspect. */
export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 3,
  backoff: {type: 'exponential', delay: 5_000},
  removeOnComplete: {age: 24 * 3600, count: 1000},
  removeOnFail: {age: 7 * 24 * 3600},
};

export interface ProcessingPlan {
  videoId: string;
  durationMs: number;
  gopFrames: number;
  renditions: (RenditionSpec & {id: string})[];
}

type TypedQueue<Q extends QueueName> = Queue<JobData<Q>, JobResults[Q]>;

/**
 * The producer side of the pipeline: everything that adds jobs. The API uses
 * `enqueueProbe`; the probe worker uses `startProcessing`.
 */
export class Pipeline {
  readonly prefix: string;
  private readonly connection: ReturnType<typeof redisConnection>;
  private readonly queues = new Map<QueueName, Queue>();
  private readonly flows: FlowProducer;
  private readonly onError: (err: Error) => void;

  constructor({redisUrl, prefix = 'vidflow', onError}: PipelineOptions) {
    this.prefix = prefix;
    this.onError = onError ?? ((err) => console.error(`queue error: ${err.message}`));
    this.connection = redisConnection(redisUrl);
    this.flows = new FlowProducer({connection: this.connection, prefix});
    this.flows.on('error', this.onError);
  }

  queue<Q extends QueueName>(name: Q): TypedQueue<Q> {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, {
        connection: this.connection,
        prefix: this.prefix,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      });
      queue.on('error', this.onError);
      this.queues.set(name, queue);
    }
    return queue as unknown as TypedQueue<Q>;
  }

  /** Step 1, after an upload completes. Idempotent per video. */
  async enqueueProbe(videoId: string): Promise<void> {
    await this.queue('probe').add('probe', {videoId}, {jobId: jobIds.probe(videoId)});
  }

  /**
   * Step 2, after probing: one Flow per video. `package` is the parent and
   * only runs once every `transcode` child has finished; a child that fails
   * for good fails the parent. Thumbnails run alongside, outside the flow.
   */
  async startProcessing(plan: ProcessingPlan): Promise<void> {
    const priority = priorityFor(plan.durationMs);
    const opts = (jobId: string): JobsOptions => ({...DEFAULT_JOB_OPTIONS, jobId, priority});

    const flow: FlowJob = {
      name: 'package',
      queueName: 'package',
      data: {videoId: plan.videoId} satisfies JobData<'package'>,
      opts: opts(jobIds.package(plan.videoId)),
      children: plan.renditions.map(({id, ...rendition}) => ({
        name: `transcode ${rendition.name}`,
        queueName: 'transcode',
        data: {
          videoId: plan.videoId,
          renditionId: id,
          rendition,
          gopFrames: plan.gopFrames,
        } satisfies JobData<'transcode'>,
        opts: {
          ...opts(jobIds.transcode(plan.videoId, rendition.name)),
          failParentOnFailure: true,
        },
      })),
    };
    await this.flows.add(flow);
    await this.queue('thumbnail').add(
      'thumbnail',
      {videoId: plan.videoId},
      opts(jobIds.thumbnail(plan.videoId)),
    );
  }

  async enqueueNotify(videoId: string, userId: string, event: WebhookEvent): Promise<void> {
    await this.queue('notify').add(
      event,
      {videoId, userId, event},
      {jobId: jobIds.notify(videoId, event), attempts: 1},
    );
  }

  /**
   * One job per webhook delivery. Receivers go down for minutes at a time, so
   * deliveries retry with a long exponential backoff: 10 s, 20 s, 40 s … about
   * 42 minutes over 8 attempts.
   */
  async enqueueDeliveries(deliveryIds: string[]): Promise<void> {
    await this.queue('deliver').addBulk(
      deliveryIds.map((deliveryId) => ({
        name: 'deliver',
        data: {deliveryId},
        opts: {
          jobId: jobIds.deliver(deliveryId),
          attempts: 8,
          backoff: {type: 'exponential', delay: 10_000},
        },
      })),
    );
  }

  /** Waiting/active/failed counts per queue: dashboards and autoscaling. */
  async counts(): Promise<Record<QueueName, Record<string, number>>> {
    const entries = await Promise.all(
      QUEUE_NAMES.map(
        async (name) =>
          [
            name,
            await this.queue(name).getJobCounts(
              'waiting',
              'prioritized',
              'active',
              'delayed',
              'waiting-children',
              'completed',
              'failed',
            ),
          ] as const,
      ),
    );
    return Object.fromEntries(entries) as Record<QueueName, Record<string, number>>;
  }

  async isAvailable(): Promise<boolean> {
    // BullMQ connections retry forever, so a dead Redis would hang the
    // health check. Give up after a second.
    const ping = this.queue('probe')
      .getJobCounts('waiting')
      .then(() => true);
    const timeout = new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(false), 1000).unref(),
    );
    return Promise.race([ping.catch(() => false), timeout]);
  }

  async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    await this.flows.close();
  }
}
