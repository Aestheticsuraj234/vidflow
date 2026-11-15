/**
 * Scales transcode workers with the queue, for Docker Compose deployments.
 * (On Kubernetes use KEDA instead: deploy/k8s/transcode-keda.yaml.)
 *
 *   pnpm autoscale            # runs until stopped
 *
 * AUTOSCALE_MIN/MAX, AUTOSCALE_JOBS_PER_REPLICA, AUTOSCALE_SCALE_DOWN_SEC,
 * COMPOSE_FILE (default docker-compose.prod.yml), COMPOSE_ENV_FILE.
 */
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

import {desiredReplicas, Pipeline, type ScaleState} from './index';

const exec = promisify(execFile);
// Compose paths are relative to the repository root.
const root = fileURLToPath(new URL('../../..', import.meta.url));
const run = (cmd: string, args: string[]) => exec(cmd, args, {cwd: root});
const env = process.env;
const policy = {
  min: Number(env.AUTOSCALE_MIN ?? 1),
  max: Number(env.AUTOSCALE_MAX ?? 8),
  jobsPerReplica: Number(env.AUTOSCALE_JOBS_PER_REPLICA ?? 2),
  scaleDownDelaySec: Number(env.AUTOSCALE_SCALE_DOWN_SEC ?? 300),
};
const composeArgs = [
  'compose',
  '-f',
  env.COMPOSE_FILE ?? 'docker-compose.prod.yml',
  ...(env.COMPOSE_ENV_FILE ? ['--env-file', env.COMPOSE_ENV_FILE] : []),
];
const pipeline = new Pipeline({
  redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
  prefix: env.QUEUE_PREFIX ?? 'vidflow',
});

async function currentReplicas(): Promise<number> {
  const {stdout} = await run('docker', [...composeArgs, 'ps', '-q', 'transcode-worker']);
  return stdout.split('\n').filter(Boolean).length;
}

let state: ScaleState = {current: await currentReplicas(), lowSince: null};
console.log(`autoscaler: ${state.current} transcode workers, policy ${JSON.stringify(policy)}`);

for (;;) {
  const counts = await pipeline.queue('transcode').getJobCounts('waiting', 'prioritized', 'active');
  const waiting = (counts.waiting ?? 0) + (counts.prioritized ?? 0);
  const next = desiredReplicas({waiting, active: counts.active ?? 0}, state, policy);
  if (next.desired !== state.current) {
    console.log(`scaling transcode-worker ${state.current} → ${next.desired} (${next.reason})`);
    // --no-recreate keeps busy replicas; compose stops the newest ones on scale-down,
    // and SIGTERM lets them finish their encode first.
    await run('docker', [
      ...composeArgs,
      'up',
      '-d',
      '--no-recreate',
      '--scale',
      `transcode-worker=${next.desired}`,
      'transcode-worker',
    ]);
  }
  state = {current: next.current, lowSince: next.lowSince};
  await new Promise((r) => setTimeout(r, 15_000));
}
