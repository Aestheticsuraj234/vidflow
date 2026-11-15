import type {ConnectionOptions} from 'bullmq';

/**
 * Connection options for BullMQ from a `redis://` or `rediss://` URL.
 * `maxRetriesPerRequest: null` is required for workers' blocking commands.
 */
export function redisConnection(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
    tls: u.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
