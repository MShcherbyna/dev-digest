import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { loadConfig, type Config } from '../../src/config.js';
import { nullLogger } from '../../src/lib/logger.js';
import { createMcpServer } from '../../src/server.js';
import { makeFake } from './fake-gateway.js';

export interface Harness {
  client: Client;
  gateway: ReturnType<typeof makeFake>;
  config: Config;
  call: (name: string, args: Record<string, unknown>) => Promise<CallToolResult>;
  close: () => Promise<void>;
}

/** Virtual clock: sleeping advances time instantly, so waits finish without real delay. */
export function virtualClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => { t += ms; } };
}

export async function connect(
  gateway = makeFake(),
  env: Record<string, string> = {},
  opts: { shutdown?: AbortSignal; clock?: ReturnType<typeof virtualClock> | { now: () => number; sleep: (ms: number, signal?: AbortSignal) => Promise<void> } } = {},
): Promise<Harness> {
  const config = loadConfig(env);
  const server = createMcpServer({ gateway, config, logger: nullLogger, clock: opts.clock ?? virtualClock(), ...(opts.shutdown ? { shutdown: opts.shutdown } : {}) });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return {
    client,
    gateway,
    config,
    call: async (name, args) => (await client.callTool({ name, arguments: args })) as CallToolResult,
    close: async () => { await client.close(); await server.close(); },
  };
}

export function textOf(r: CallToolResult): string {
  const first = r.content[0];
  return first && first.type === 'text' ? first.text : '';
}

export function structured<T = Record<string, unknown>>(r: CallToolResult): T {
  return r.structuredContent as T;
}
