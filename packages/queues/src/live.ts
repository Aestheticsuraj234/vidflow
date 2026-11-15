import {Redis} from 'ioredis';

import {redisConnection} from './connection';

/** What the dashboard receives whenever a video changes. */
export interface LiveVideoUpdate {
  videoId: string;
  status: string;
  progress: number;
  error: string | null;
  /** Present when the change was a timeline event. */
  event?: {stage: string; message: string};
  at: string;
}

export interface LiveVideoState {
  userId: string;
  status: string;
  progress: number;
  error: string | null;
}

const channel = (prefix: string, userId: string) => `${prefix}:live:user:${userId}`;

function client(redisUrl: string, onError: (err: Error) => void): Redis {
  // Unlike BullMQ, pub/sub clients should fail commands rather than queue
  // them forever, so drop BullMQ's `maxRetriesPerRequest: null`.
  const options = {...(redisConnection(redisUrl) as Record<string, unknown>)};
  delete options.maxRetriesPerRequest;
  const redis = new Redis(options);
  redis.on('error', onError);
  return redis;
}

export interface LivePublisherOptions {
  redisUrl: string;
  prefix?: string;
  /** Loads the current state; called once per burst of changes. */
  load: (videoId: string) => Promise<LiveVideoState | undefined>;
  /** Coalesce bursts of changes to one message per video per window. */
  throttleMs?: number;
  onError?: (err: Error) => void;
}

/**
 * Publishes video changes to Redis pub/sub, one channel per user. Writes
 * often come in bursts (progress, rendition, event), so changes to the same
 * video within `throttleMs` become one message, carrying the latest state.
 * Timeline events are never dropped.
 */
export class LivePublisher {
  private readonly redis: Redis;
  private readonly prefix: string;
  private readonly pending = new Map<
    string,
    {timer: NodeJS.Timeout; events: LiveVideoUpdate['event'][]}
  >();

  constructor(private readonly options: LivePublisherOptions) {
    this.prefix = options.prefix ?? 'vidflow';
    this.redis = client(
      options.redisUrl,
      options.onError ?? ((err) => console.error(`live publisher: ${err.message}`)),
    );
  }

  /** Hook for `VideoRepository`'s `onChange`. */
  videoChanged = ({videoId, event}: {videoId: string; event?: LiveVideoUpdate['event']}): void => {
    const existing = this.pending.get(videoId);
    if (existing) {
      if (event) existing.events.push(event);
      return;
    }
    const entry = {
      events: event ? [event] : [],
      timer: setTimeout(() => void this.flush(videoId), this.options.throttleMs ?? 250),
    };
    this.pending.set(videoId, entry);
  };

  private async flush(videoId: string): Promise<void> {
    const entry = this.pending.get(videoId);
    this.pending.delete(videoId);
    try {
      const state = await this.options.load(videoId);
      if (!state) return;
      const base = {
        videoId,
        status: state.status,
        progress: state.progress,
        error: state.error,
        at: new Date().toISOString(),
      };
      const messages: LiveVideoUpdate[] =
        entry && entry.events.length > 0 ? entry.events.map((event) => ({...base, event})) : [base];
      const target = channel(this.prefix, state.userId);
      for (const m of messages) await this.redis.publish(target, JSON.stringify(m));
    } catch (err) {
      this.options.onError?.(err as Error);
    }
  }

  /** Sends anything still waiting, then disconnects. */
  async close(): Promise<void> {
    const ids = [...this.pending.keys()];
    for (const id of ids) clearTimeout(this.pending.get(id)?.timer);
    await Promise.all(ids.map((id) => this.flush(id)));
    await this.redis.quit().catch(() => undefined);
  }
}

type Listener = (update: LiveVideoUpdate) => void;

/**
 * One Redis subscription per API process, fanned out in memory to every open
 * SSE connection. Subscribes to a user's channel when their first tab
 * connects and unsubscribes when the last one closes.
 */
export class LiveHub {
  private readonly redis: Redis;
  private readonly prefix: string;
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor({
    redisUrl,
    prefix = 'vidflow',
    onError = (err: Error) => console.error(`live hub: ${err.message}`),
  }: {
    redisUrl: string;
    prefix?: string;
    onError?: (err: Error) => void;
  }) {
    this.prefix = prefix;
    this.redis = client(redisUrl, onError);
    this.redis.on('message', (ch: string, message: string) => {
      const userId = ch.slice(channel(this.prefix, '').length);
      const set = this.listeners.get(userId);
      if (!set) return;
      let update: LiveVideoUpdate;
      try {
        update = JSON.parse(message) as LiveVideoUpdate;
      } catch {
        return;
      }
      for (const listener of set) listener(update);
    });
  }

  /** Returns an unsubscribe function. */
  async subscribe(userId: string, listener: Listener): Promise<() => Promise<void>> {
    let set = this.listeners.get(userId);
    if (!set) {
      set = new Set();
      this.listeners.set(userId, set);
      await this.redis.subscribe(channel(this.prefix, userId));
    }
    set.add(listener);
    return async () => {
      const current = this.listeners.get(userId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        this.listeners.delete(userId);
        await this.redis.unsubscribe(channel(this.prefix, userId)).catch(() => undefined);
      }
    };
  }

  /** Open SSE connections, for metrics. */
  get connections(): number {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }

  async close(): Promise<void> {
    this.listeners.clear();
    await this.redis.quit().catch(() => undefined);
  }
}
