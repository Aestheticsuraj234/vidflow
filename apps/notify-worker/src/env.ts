import {z} from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const schema = z.object({
  DATABASE_URL: z.string().min(1).default('postgres://postgres:postgres@localhost:5432/vidflow'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  QUEUE_PREFIX: z.string().min(1).default('vidflow'),
  NOTIFY_CONCURRENCY: z.coerce.number().int().positive().default(10),
  /** Let webhooks reach localhost and private networks. Development only. */
  WEBHOOK_ALLOW_PRIVATE: bool,
  WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

export type NotifyEnv = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): NotifyEnv {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment:\n${issues.join('\n')}`);
  }
  return result.data;
}
