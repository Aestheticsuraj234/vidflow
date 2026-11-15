import {z} from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1).default('postgres://postgres:postgres@localhost:5432/vidflow'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  QUEUE_PREFIX: z.string().min(1).default('vidflow'),
  /** `/metrics` and `/health` for Prometheus and probes; 0 turns it off. */
  METRICS_PORT: z.coerce.number().int().nonnegative().default(9465),
  PROBE_CONCURRENCY: z.coerce.number().int().positive().default(4),
  /** Longest video accepted. Default 4 hours. */
  MAX_DURATION_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(4 * 3600_000),
});

export type ProbeEnv = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): ProbeEnv {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(
      `Invalid environment:\n${result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`,
    );
  }
  return result.data;
}
