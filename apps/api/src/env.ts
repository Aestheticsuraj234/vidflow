import {z} from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_URL: z.url().default('http://localhost:4000'),
  WEB_URL: z.url().default('http://localhost:3000'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  /** Redis key prefix for queues; tests use their own. */
  QUEUE_PREFIX: z.string().min(1).default('vidflow'),
  DATABASE_URL: z.string().min(1).default('postgres://postgres:postgres@localhost:5432/vidflow'),
  /** Largest upload accepted, in bytes. Default 10 GiB. */
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 ** 3),
  /** Comma-separated emails allowed into Bull Board at /admin/queues. */
  ADMIN_EMAILS: z
    .string()
    .default('')
    .transform((v) => v.split(',').filter(Boolean)),
  UPLOADS_PER_HOUR: z.coerce.number().int().positive().default(30),
  /** Videos one user may have in the pipeline (uploaded → processing) at once. */
  MAX_ACTIVE_VIDEOS: z.coerce.number().int().positive().default(5),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, {message: 'BETTER_AUTH_SECRET must be at least 32 characters'}),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Reads and validates environment variables. Fails fast with a readable
 * message, so a missing secret never turns into a confusing runtime error.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment variables:\n${issues.join('\n')}`);
  }
  return result.data;
}
