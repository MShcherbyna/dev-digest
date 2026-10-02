import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deadPortUrl, startFakeApi } from '../test/helpers/fake-api.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tsx = resolve(root, 'node_modules/.bin/tsx');

async function withClient<T>(apiUrl: string, fn: (c: Client) => Promise<T>): Promise<T> {
  const transport = new StdioClientTransport({
    command: tsx,
    args: ['src/main.ts'],
    cwd: root,
    env: { PATH: process.env.PATH ?? '', DEVDIGEST_API_URL: apiUrl },
    stderr: 'ignore',
  });
  const client = new Client({ name: 'stdio-test', version: '0' });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

describe('stdio entrypoint (spawned process)', () => {
  it('initializes, lists 5 tools and answers list_agents (stdout carries only JSON-RPC)', async () => {
    const api = await startFakeApi();
    try {
      await withClient(api.url, async (c) => {
        expect((await c.listTools()).tools).toHaveLength(5);
        const r = await c.callTool({ name: 'list_agents', arguments: {} });
        expect(r.isError).toBeFalsy();
        expect(JSON.stringify(r.structuredContent)).toContain('security-reviewer');
        expect(JSON.stringify(r)).not.toContain('SECRET');
      });
    } finally {
      await api.close();
    }
  });

  it('still starts with the API down and returns an api_down isError', async () => {
    const url = await deadPortUrl();
    await withClient(url, async (c) => {
      const r = await c.callTool({ name: 'list_agents', arguments: {} });
      expect(r.isError).toBe(true);
      expect(JSON.stringify(r.content)).toContain('not reachable');
    });
  });

  it('exits non-zero on a non-loopback API URL', async () => {
    const transport = new StdioClientTransport({
      command: tsx, args: ['src/main.ts'], cwd: root,
      env: { PATH: process.env.PATH ?? '', DEVDIGEST_API_URL: 'https://example.com' }, stderr: 'ignore',
    });
    await expect(new Client({ name: 't', version: '0' }).connect(transport)).rejects.toBeDefined();
  });

  it('lets an in-flight call finish when stdin closes (drains before exit)', async () => {
    const api = await startFakeApi(700);
    try {
      const child = spawn(tsx, ['src/main.ts'], { cwd: root, env: { PATH: process.env.PATH ?? '', DEVDIGEST_API_URL: api.url }, stdio: ['pipe', 'pipe', 'ignore'] });
      let out = '';
      child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
      const exited = new Promise<number | null>((r) => child.on('exit', (c) => r(c)));
      const send = (m: unknown): void => { child.stdin.write(`${JSON.stringify(m)}\n`); };
      send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
      await new Promise((r) => setTimeout(r, 1500));
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_agents', arguments: {} } });
      await new Promise((r) => setTimeout(r, 200));
      child.stdin.end(); // EOF while the API call (700 ms) is still in flight
      expect(await exited).toBe(0);
      expect(out).toContain('security-reviewer');
    } finally {
      await api.close();
    }
  });
});
