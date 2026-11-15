import {Redis} from 'ioredis';

import {redisConnection} from './connection';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfterSec: number;
}

/**
 * Fixed-window counter in Redis: `INCR` + `EXPIRE` in one transaction. Shared
 * by every API instance, so the limit holds however many replicas run.
 */
export class RateLimiter {
  private readonly redis: Redis;

  constructor(
    redisUrl: string,
    private readonly prefix = 'vidflow',
  ) {
    const options = {...(redisConnection(redisUrl) as Record<string, unknown>)};
    delete options.maxRetriesPerRequest;
    this.redis = new Redis(options);
    this.redis.on('error', () => undefined);
  }

  async hit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
    const window = Math.floor(Date.now() / 1000 / windowSec);
    const redisKey = `${this.prefix}:ratelimit:${key}:${window}`;
    const res = await this.redis.multi().incr(redisKey).expire(redisKey, windowSec).exec();
    const used = Number(res?.[0]?.[1] ?? 0);
    const retryAfterSec = (window + 1) * windowSec - Math.floor(Date.now() / 1000);
    return {allowed: used <= limit, remaining: Math.max(0, limit - used), retryAfterSec};
  }

  async close(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
