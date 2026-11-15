/** `pnpm queues:stats`: job counts per queue, refreshed every second with --watch. */
import {Pipeline, QUEUE_NAMES} from './index';

const pipeline = new Pipeline({
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  prefix: process.env.QUEUE_PREFIX ?? 'vidflow',
});
const columns = [
  'waiting',
  'prioritized',
  'waiting-children',
  'active',
  'delayed',
  'completed',
  'failed',
];

async function print() {
  const counts = await pipeline.counts();
  const rows = QUEUE_NAMES.map((q) => ({queue: q, ...counts[q]}));
  console.clear();
  console.table(rows, ['queue', ...columns]);
}

if (process.argv.includes('--watch')) {
  setInterval(() => void print(), 1000);
} else {
  await print();
  await pipeline.close();
}
