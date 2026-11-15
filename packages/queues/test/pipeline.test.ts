/** BullMQ behaviour the pipeline relies on, against real Redis. */
import {randomUUID} from 'node:crypto';

import {Queue, type Worker} from 'bullmq';
import {afterAll, afterEach, describe, expect, it} from 'vitest';

import {
  createWorker,
  jobIds,
  Pipeline,
  priorityFor,
  QUEUE_NAMES,
  redisConnection,
  type ProcessingPlan,
} from '../src';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const prefix = `vidflow-test-${process.pid}`;
const pipeline = new Pipeline({redisUrl, prefix});
const workers: Worker[] = [];
const silent = {info: () => undefined, error: () => undefined};

afterEach(async () => {
  await Promise.all(workers.splice(0).map((w) => w.close()));
  for (const name of QUEUE_NAMES) await pipeline.queue(name).obliterate({force: true});
});
afterAll(() => pipeline.close());

function plan(videoId = randomUUID()): ProcessingPlan {
  const r = (name: string, height: number) => ({
    id: randomUUID(),
    name,
    width: Math.round((height * 16) / 9),
    height,
    videoBitrateKbps: height * 5,
    audioBitrateKbps: 128,
  });
  return {videoId, durationMs: 60_000, gopFrames: 48, renditions: [r('720p', 720), r('360p', 360)]};
}

describe('contracts', () => {
  it('builds IDs BullMQ accepts', () => {
    expect(jobIds.transcode('v', '720p')).toBe('transcode-v-720p');
    expect(Object.values(jobIds).every((f) => !f('a', 'video.ready' as never).includes(':'))).toBe(
      true,
    );
  });

  it('puts short videos first', () => {
    expect(priorityFor(30_000)).toBe(1);
    expect(priorityFor(20 * 60_000)).toBe(5);
    expect(priorityFor(10 * 3600_000)).toBe(21);
  });

  it('parses redis URLs', () => {
    expect(redisConnection('rediss://:p%40ss@cache:6380/2')).toMatchObject({
      host: 'cache',
      port: 6380,
      password: 'p@ss',
      db: 2,
      tls: {},
      maxRetriesPerRequest: null,
    });
  });
});

describe('Pipeline', () => {
  it('enqueues probe once per video, however often it is asked', async () => {
    const id = randomUUID();
    await Promise.all([
      pipeline.enqueueProbe(id),
      pipeline.enqueueProbe(id),
      pipeline.enqueueProbe(id),
    ]);
    expect(await pipeline.queue('probe').getJobCountByTypes('waiting')).toBe(1);
    expect((await pipeline.queue('probe').getJob(jobIds.probe(id)))?.data).toEqual({videoId: id});
  });

  it('runs package only after every transcode finishes, with their results', async () => {
    const p = plan();
    const order: string[] = [];
    workers.push(
      createWorker(
        'transcode',
        async (data) => {
          order.push(`transcode ${data.rendition.name}`);
          return {
            renditionId: data.renditionId,
            name: data.rendition.name,
            mp4Key: `work/${data.videoId}/${data.rendition.name}.mp4`,
            sizeBytes: 1,
            encodeMs: 1,
          };
        },
        {redisUrl, prefix, log: silent, concurrency: 2},
      ),
    );
    const done = new Promise<string[]>((resolve) => {
      workers.push(
        createWorker(
          'package',
          async (data, job) => {
            order.push('package');
            const children = Object.values(await job.getChildrenValues()) as {name: string}[];
            resolve(children.map((c) => c.name).sort());
            return {masterKey: `public/videos/${data.videoId}/master.m3u8`, renditions: []};
          },
          {redisUrl, prefix, log: silent},
        ),
      );
    });
    await pipeline.startProcessing(p);
    expect(await done).toEqual(['360p', '720p']);
    expect(order.at(-1)).toBe('package');
    expect(await pipeline.queue('thumbnail').getJob(jobIds.thumbnail(p.videoId))).toBeTruthy();
  });

  it('adding the same flow twice changes nothing', async () => {
    const p = plan();
    await pipeline.startProcessing(p);
    await pipeline.startProcessing(p);
    expect(await pipeline.queue('transcode').getJobCountByTypes('prioritized', 'waiting')).toBe(2);
    expect(await pipeline.queue('package').getJobCountByTypes('waiting-children')).toBe(1);
    expect(await pipeline.queue('thumbnail').getJobCountByTypes('prioritized', 'waiting')).toBe(1);
  });

  it('fails the parent when a transcode fails for good', async () => {
    const p = plan();
    workers.push(
      createWorker(
        'transcode',
        async () => {
          throw new Error('ffmpeg exploded');
        },
        {redisUrl, prefix, log: silent},
      ),
    );
    // BullMQ 6 marks the parent with a deferred failure and moves it to
    // waiting; it fails when a package worker picks it up, without running.
    let packaged = 0;
    workers.push(
      createWorker(
        'package',
        async () => {
          packaged++;
          return {masterKey: '', renditions: []};
        },
        {redisUrl, prefix, log: silent},
      ),
    );
    await pipeline.startProcessing(p);
    // Retries back off exponentially; promote delayed jobs so the test is fast.
    const parent = jobIds.package(p.videoId);
    let state = '';
    for (let i = 0; i < 100 && state !== 'failed'; i++) {
      for (const j of await pipeline.queue('transcode').getJobs(['delayed'])) {
        await j.promote().catch(() => undefined);
      }
      await new Promise((r) => setTimeout(r, 100));
      state = await pipeline.queue('package').getJobState(parent);
    }
    expect(state).toBe('failed');
    const transcode = await pipeline.queue('transcode').getJob(jobIds.transcode(p.videoId, '720p'));
    expect(transcode?.attemptsMade).toBe(3);
    expect(packaged).toBe(0);
    expect((await pipeline.queue('package').getJob(parent))?.failedReason).toMatch(
      /child .* failed/,
    );
  });

  it('rejects malformed job data without retrying', async () => {
    const queue = new Queue('probe', {connection: redisConnection(redisUrl), prefix});
    const job = await queue.add('probe', {videoId: 'not-a-uuid'}, {attempts: 3});
    let calls = 0;
    const failed = new Promise<number>((resolve) => {
      const w = createWorker(
        'probe',
        async () => {
          calls++;
          return {durationMs: 0, renditions: []};
        },
        {redisUrl, prefix, log: silent},
      );
      w.on('failed', (j) => resolve(j?.attemptsMade ?? -1));
      workers.push(w);
    });
    expect(await failed).toBe(1);
    expect(calls).toBe(0);
    expect((await queue.getJob(job.id ?? ''))?.failedReason).toMatch(/Invalid probe job data/);
    await queue.close();
  });

  it('reports queue counts and health', async () => {
    await pipeline.enqueueProbe(randomUUID());
    const counts = await pipeline.counts();
    expect(counts.probe?.waiting).toBe(1);
    expect(Object.keys(counts).sort()).toEqual([...QUEUE_NAMES].sort());
    expect(await pipeline.isAvailable()).toBe(true);
    const dead = new Pipeline({redisUrl: 'redis://127.0.0.1:1', prefix, onError: () => undefined});
    expect(await dead.isAvailable()).toBe(false);
    void dead.close().catch(() => undefined);
  });
});
