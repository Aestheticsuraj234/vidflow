import {createServer, type Server} from 'node:http';

import type {Registry} from 'prom-client';

/**
 * A tiny HTTP server for a worker: `/metrics` for Prometheus, `/health` for
 * Docker/Kubernetes probes. `healthy()` decides the probe's answer.
 */
export function startMetricsServer(
  port: number,
  registry: Registry,
  healthy: () => boolean | Promise<boolean> = () => true,
  /** A busy port must not take the worker down with it: report and carry on. */
  onError: (err: Error) => void = (err) => console.error(`metrics server: ${err.message}`),
): Server {
  const server = createServer(async (req, res) => {
    try {
      if (req.url === '/metrics') {
        res.writeHead(200, {'Content-Type': registry.contentType});
        res.end(await registry.metrics());
      } else if (req.url === '/health') {
        const ok = await healthy();
        res.writeHead(ok ? 200 : 503, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({status: ok ? 'ok' : 'down'}));
      } else {
        res.writeHead(404).end();
      }
    } catch (err) {
      res.writeHead(500).end((err as Error).message);
    }
  });
  server.on('error', onError);
  server.listen(port);
  return server;
}
