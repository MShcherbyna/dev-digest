import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeApi {
  url: string;
  close: () => Promise<void>;
}

/** Minimal node:http stand-in for the DevDigest API (just what devdigest_list_agents needs). */
export async function startFakeApi(delayMs = 0): Promise<FakeApi> {
  const server: Server = createServer(async (req, res) => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    res.setHeader('content-type', 'application/json');
    if (req.url === '/agents') {
      res.end(JSON.stringify([{ id: 'a1', name: 'Security Reviewer', description: 'd', provider: 'openai', model: 'gpt', enabled: true, system_prompt: 'SECRET' }]));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: { code: 'not_found', message: 'nope' } }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => { server.close(() => r()); server.closeAllConnections(); }),
  };
}

/** A loopback port that nothing listens on (start + stop a server to reserve it). */
export async function deadPortUrl(): Promise<string> {
  const api = await startFakeApi();
  const url = api.url;
  await api.close();
  return url;
}
