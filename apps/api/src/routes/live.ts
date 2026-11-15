import type {LiveHub} from '@vidflow/queues';
import {Hono} from 'hono';
import {streamSSE} from 'hono/streaming';

import type {AppEnv} from '../app-env';
import {UnauthorizedError} from '../lib/errors';
import {requireUser} from '../middleware/session';

/**
 * `GET /v1/live`: server-sent events with every change to the user's videos.
 * One Redis subscription per user per API process; a comment every 15 s keeps
 * proxies from closing an idle connection.
 */
export function liveRoutes(hub: LiveHub, {heartbeatMs = 15_000} = {}) {
  return new Hono<AppEnv>().get('/', requireUser, (c) => {
    const user = c.get('user');
    if (!user) throw new UnauthorizedError();
    c.header('X-Accel-Buffering', 'no'); // nginx: don't buffer the stream
    return streamSSE(c, async (stream) => {
      let id = 0;
      const unsubscribe = await hub.subscribe(user.id, (update) => {
        void stream.writeSSE({event: 'video', id: String(++id), data: JSON.stringify(update)});
      });
      await stream.writeSSE({event: 'ready', data: '{}'});
      const heartbeat = setInterval(() => void stream.write(': ping\n\n'), heartbeatMs);
      await new Promise<void>((resolve) => stream.onAbort(resolve));
      clearInterval(heartbeat);
      await unsubscribe();
    });
  });
}
