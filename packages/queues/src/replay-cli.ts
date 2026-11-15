/**
 * Dead letters.
 *   pnpm queues:replay            list them
 *   pnpm queues:replay <id>       retry one
 *   pnpm queues:replay --all      retry all
 */
import {Pipeline} from './index';

const pipeline = new Pipeline({
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  prefix: process.env.QUEUE_PREFIX ?? 'vidflow',
});
const arg = process.argv[2];
const letters = await pipeline.queue('dead').getJobs(['waiting', 'prioritized']);

if (!arg) {
  if (letters.length === 0) console.log('No dead letters.');
  for (const j of letters) {
    console.log(
      `${j.id}  ${j.data.queue}/${j.data.jobId}  ×${j.data.attemptsMade}  ${j.data.failedAt}\n    ${j.data.failedReason}`,
    );
  }
} else {
  const ids = arg === '--all' ? letters.map((j) => j.id ?? '') : [arg];
  for (const id of ids) console.log(`${id}: ${await pipeline.replay(id)}`);
}
await pipeline.close();
