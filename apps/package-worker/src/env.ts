import {tmpdir} from 'node:os';

import {z} from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1).default('postgres://postgres:postgres@localhost:5432/vidflow'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  QUEUE_PREFIX: z.string().min(1).default('vidflow'),
  /** Packaging is I/O-bound (`-c copy` + uploads), so a few at once is fine. */
  PACKAGE_CONCURRENCY: z.coerce.number().int().positive().default(4),
  PACKAGE_TMP_DIR: z.string().default(tmpdir()),
  /** Keep the intermediate MP4s in `work/` after packaging (e.g. for downloads). */
  KEEP_RENDITION_MP4: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type PackageEnv = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): PackageEnv {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment:\n${issues.join('\n')}`);
  }
  return result.data;
}
