#!/usr/bin/env tsx
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ConfigError, loadConfig } from './config.js';
import { HttpGateway } from './gateway/http-gateway.js';
import { InflightTracker } from './lib/inflight.js';
import { createLogger } from './lib/logger.js';
import { createMcpServer } from './server.js';

// stdout is protocol-only: anything else printed there breaks JSON-RPC framing.
// Defence in depth: reroute stray console output to stderr.
const toStderr = (...args: unknown[]): void => {
  process.stderr.write(`${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`);
};
console.log = toStderr;
console.info = toStderr;
console.debug = toStderr;

const DRAIN_MS = 5_000;

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    process.stderr.write(`${err instanceof ConfigError ? err.message : String(err)}\n`);
    process.exit(1);
  }
  const logger = createLogger(config.logLevel);
  const gateway = new HttpGateway(config, logger);
  const inflight = new InflightTracker();
  const shutdownCtl = new AbortController();
  const server = createMcpServer({ gateway, config, logger, inflight, shutdown: shutdownCtl.signal });

  let closing = false;
  const shutdown = async (reason: string): Promise<void> => {
    if (closing) return;
    closing = true;
    logger.info('shutting down', { reason });
    // Tell waiting handlers to stop polling and return status "running" (the run itself continues).
    shutdownCtl.abort();
    try {
      // Let in-flight tool calls finish (bounded) so their responses are flushed.
      const drained = await inflight.drain(DRAIN_MS);
      if (!drained) logger.warn('shutdown: in-flight calls did not settle in time', { ms: DRAIN_MS });
      // The SDK sends the response after the handler resolves; yield, then flush stdout.
      await new Promise((r) => setTimeout(r, 25));
      await new Promise<void>((r) => process.stdout.write('', () => r()));
      await server.close();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.stdin.on('end', () => void shutdown('stdin end'));

  // No API probe at startup: the server must start even when the API is down.
  await server.connect(new StdioServerTransport());
  logger.info('devdigest-mcp ready', { apiUrl: config.apiUrl });
}

main().catch((err: unknown) => {
  process.stderr.write(`devdigest-mcp failed to start: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
