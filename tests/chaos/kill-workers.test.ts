/**
 * Chaos: run the real worker processes, SIGKILL a transcode worker in the
 * middle of an encode, and check the video still ends up ready.
 *
 *   pnpm test:chaos      (needs Postgres, Redis, RustFS, FFmpeg)
 */
import {spawn, type ChildProcess} from 'node:child_process';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

import {jobIds} from '@vidflow/queues';
import {createTestContext} from '@vidflow/test-utils';
import {afterAll, expect, it} from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const t = createTestContext('chaos');
const procs: ChildProcess[] = [];

function startWorker(app: string, extra: Record<string, string> = {}): ChildProcess {
  const child = spawn('pnpm', ['exec', 'tsx', 'src/index.ts'], {
    cwd: join(root, 'apps', app),
    env: {
      ...process.env,
      S3_ENDPOINT: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
      S3_REGION: process.env.S3_REGION ?? 'us-east-1',
      S3_BUCKET: process.env.S3_BUCKET ?? 'vidflow',
      S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? 'vidflow',
      S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY ?? 'vidflow-secret-key',
      S3_FORCE_PATH_STYLE: 'true',
      S3_PUBLIC_BASE_URL: process.env.S3_PUBLIC_BASE_URL ?? 'http://localhost:9000/vidflow',
      QUEUE_PREFIX: t.prefix,
      // Several workers on one host: no metrics ports to fight over.
      METRICS_PORT: '0',
      // Fast recovery: a dead worker's job is noticed within ~3 s.
      TRANSCODE_LOCK_MS: '3000',
      FFMPEG_PRESET: 'medium',
      FFMPEG_THREADS: '2',
      ...extra,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true, // own process group, so SIGKILL takes FFmpeg too
  });
  child.stdout?.on('data', () => undefined);
  child.stderr?.on('data', () => undefined);
  procs.push(child);
  return child;
}

function kill(child: ChildProcess) {
  if (child.pid) process.kill(-child.pid, 'SIGKILL');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterAll(async () => {
  for (const p of procs) {
    try {
      kill(p);
    } catch {
      // already gone
    }
  }
  await t.close();
});

it('survives a transcode worker killed mid-encode', async () => {
  const video = await t.uploadedVideo('long.mp4');
  for (const app of ['probe-worker', 'package-worker', 'thumbnail-worker']) startWorker(app);
  const victim = startWorker('transcode-worker');
  const survivor = startWorker('transcode-worker');
  await t.pipeline.enqueueProbe(video.id);

  // Wait until both transcode workers are encoding, then kill one.
  const transcode = t.pipeline.queue('transcode');
  for (let i = 0; i < 600 && (await transcode.getActiveCount()) < 2; i++) await sleep(100);
  expect(await transcode.getActiveCount()).toBe(2);
  await sleep(1500);
  kill(victim);
  const killedAt = Date.now();

  // The survivor finishes its own work and picks up the stalled job.
  let status = '';
  for (let i = 0; i < 400 && status !== 'ready' && status !== 'failed'; i++) {
    await sleep(500);
    status = (await t.videos.findById(video.id))?.status ?? '';
  }
  expect(status).toBe('ready');
  expect(survivor.exitCode).toBeNull();

  // Every rendition got packaged, and at least one transcode job was recovered
  // after a stall (BullMQ counts it in `stalledCounter`).
  const renditions = await t.videos.listRenditions(video.id);
  expect(renditions.every((r) => r.status === 'packaged')).toBe(true);
  const jobs = await Promise.all(
    renditions.map((r) => transcode.getJob(jobIds.transcode(video.id, r.name))),
  );
  const recovered = jobs.filter((j) => (j?.stalledCounter ?? 0) > 0);
  expect(recovered.length).toBeGreaterThanOrEqual(1);
  console.log(
    `ready ${((Date.now() - killedAt) / 1000).toFixed(1)}s after the kill; recovered: ${recovered.map((j) => j?.id).join(', ')}`,
  );
});
