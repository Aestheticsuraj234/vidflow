import {tmpdir} from 'node:os';

import {z} from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1).default('postgres://postgres:postgres@localhost:5432/vidflow'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  QUEUE_PREFIX: z.string().min(1).default('vidflow'),
  /**
   * Encodes at once per worker. x264 already uses every core, so 1 is right
   * for most machines; scale with more worker processes instead.
   */
  TRANSCODE_CONCURRENCY: z.coerce.number().int().positive().default(1),
  /** x264 threads per encode; 0 = one per core. */
  FFMPEG_THREADS: z.coerce.number().int().nonnegative().default(0),
  FFMPEG_PRESET: z
    .enum(['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow'])
    .default('veryfast'),
  /** Kill an encode that runs longer than this. Default 2 hours. */
  TRANSCODE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(2 * 3600_000),
  /**
   * How long a job's lock lasts before it must be renewed, and how often BullMQ
   * looks for stalled jobs (a worker that died mid-encode). Lower means faster
   * recovery after a crash; too low and a busy worker looks dead.
   */
  TRANSCODE_LOCK_MS: z.coerce.number().int().min(1000).default(60_000),
  /** Scratch space for encoded files before upload. */
  TRANSCODE_TMP_DIR: z.string().default(tmpdir()),
});

export type TranscodeEnv = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): TranscodeEnv {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment:\n${issues.join('\n')}`);
  }
  return result.data;
}
