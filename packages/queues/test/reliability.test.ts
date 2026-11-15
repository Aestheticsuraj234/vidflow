import {randomUUID} from 'node:crypto';

import type {Worker} from 'bullmq';
import {afterAll, afterEach, describe, expect, it} from 'vitest';

import {createWorker, jobIds, onFinalFailure, Pipeline, QUEUE_NAMES} from '../src';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const prefix = `vidflow-test-rel-${process.pid}`;
const pipeline = new Pipeline({redisUrl, prefix});
const silent = {info: () => undefined, error: () => undefined};
const workers: Worker[] = [];
afterEach(async () => {
  await Promise.all(workers.splice(0).map((w) => w.close()));
  for (const q of QUEUE_NAMES) await pipeline.queue(q).obliterate({force: true});
});
afterAll(() => pipeline.close());

const plan = (videoId: string) => ({
  videoId,
  durationMs: 1000,
  gopFrames: 60,
  renditions: ['720p', '360p'].map((name) => ({
    id: randomUUID(),
    name,
    width: 640,
    height: Number.parseInt(name),
    videoBitrateKbps: 500,
    audioBitrateKbps: 64,
  })),
});

describe('cancelVideo', () => {
  it('removes every queued job of the video and nothing else', async () => {
    const a = randomUUID();
    const b = randomUUID();
    await pipeline.enqueueProbe(a);
    await pipeline.startProcessing(plan(a));
    await pipeline.startProcessing(plan(b));

    expect(await pipeline.cancelVideo(a, ['720p', '360p'])).toBe(5);
    for (const [q, id] of [
      ['probe', jobIds.probe(a)],
      ['thumbnail', jobIds.thumbnail(a)],
      ['transcode', jobIds.transcode(a, '720p')],
      ['package', jobIds.package(a)],
    ] as const) {
      expect(await pipeline.queue(q).getJob(id)).toBeUndefined();
    }
    // The other video's flow is untouched.
    expect(await pipeline.queue('package').getJob(jobIds.package(b))).toBeTruthy();
    expect(await pipeline.queue('transcode').getJob(jobIds.transcode(b, '360p'))).toBeTruthy();
  });
});

describe('dead letters', () => {
  it('records a job that failed for good and replays it', async () => {
    let attempts = 0;
    const worker = createWorker(
      'thumbnail',
      async () => {
        attempts++;
        if (attempts === 1) throw new Error('disk full');
        return {posterKey: 'p', spriteKey: null};
      },
      {redisUrl, prefix, log: silent},
    );
    workers.push(worker);
    const dead = new Promise<void>((resolve) =>
      onFinalFailure(worker, async () => resolve(), silent, pipeline),
    );
    const videoId = randomUUID();
    await pipeline
      .queue('thumbnail')
      .add('thumbnail', {videoId}, {jobId: jobIds.thumbnail(videoId), attempts: 1});
    await dead;
    await new Promise((r) => setTimeout(r, 100));

    const [letter] = await pipeline.queue('dead').getJobs(['waiting']);
    expect(letter?.data).toMatchObject({
      queue: 'thumbnail',
      jobId: jobIds.thumbnail(videoId),
      failedReason: 'disk full',
      attemptsMade: 1,
    });

    expect(await pipeline.replay(letter!.id!)).toBe('retried');
    await new Promise((r) => setTimeout(r, 500));
    expect(await pipeline.queue('thumbnail').getJobState(jobIds.thumbnail(videoId))).toBe(
      'completed',
    );
    expect(await pipeline.queue('dead').getJobCountByTypes('waiting')).toBe(0);
    expect(await pipeline.replay('nope')).toBe('not-found');
  });
});
