import { describe, expect, it } from 'vitest';
import { GatewayNotFoundError, GatewayResponseError, GatewayUnavailableError } from './errors.js';
import { HttpGateway } from './http-gateway.js';

const cfg = { apiUrl: 'http://localhost:3001', httpTimeoutMs: 1000, resolveTimeoutMs: 2000 };
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function gw(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): HttpGateway {
  return new HttpGateway(cfg, undefined, (async (u: string | URL | Request, init?: RequestInit) => handler(String(u), init)) as typeof fetch);
}

describe('HttpGateway', () => {
  it('maps agents and strips system_prompt', async () => {
    const g = gw(() => json([{ id: 'a', name: 'N', description: 'd', provider: 'openai', model: 'm', enabled: true, system_prompt: 'SECRET', version: 1 }]));
    const [a] = await g.listAgents();
    expect(a).toEqual({ id: 'a', name: 'N', description: 'd', provider: 'openai', model: 'm', enabled: true });
    expect(JSON.stringify(a)).not.toContain('SECRET');
  });

  it('findPull matches by number and needs an id', async () => {
    const g = gw(() => json([{ id: 'p1', number: 5, title: 'T' }, { number: 6, title: 'no id' }]));
    expect(await g.findPull('r', 5)).toEqual({ id: 'p1', number: 5, title: 'T' });
    expect(await g.findPull('r', 6)).toBeNull();
  });

  it('sends only the agentId when starting a review', async () => {
    let seen: { url: string; body: unknown } | undefined;
    const g = gw((url, init) => {
      seen = { url, body: JSON.parse(String(init?.body)) };
      return json({ pr_id: 'p', runs: [{ run_id: 'r1', agent_id: 'a', agent_name: 'A' }], reviews: [] });
    });
    expect(await g.startReview('p 1', 'a')).toEqual({ runId: 'r1' });
    expect(seen?.url).toBe('http://localhost:3001/pulls/p%201/review');
    expect(seen?.body).toEqual({ agentId: 'a' });
  });

  it('connection refused -> api_down', async () => {
    const g = new HttpGateway(cfg, undefined, (async () => { throw new TypeError('fetch failed'); }) as typeof fetch);
    await expect(g.listAgents()).rejects.toMatchObject({ kind: 'api_down' });
    await expect(g.listAgents()).rejects.toBeInstanceOf(GatewayUnavailableError);
  });

  it('timeout -> timeout', async () => {
    const g = new HttpGateway(cfg, undefined, (async () => { throw new DOMException('t', 'TimeoutError'); }) as typeof fetch);
    await expect(g.listAgents()).rejects.toMatchObject({ kind: 'timeout', timeoutMs: 1000 });
  });

  it('500 with ready 503 -> db_down; 500 with ready ok -> response error', async () => {
    const down = gw((url) => (url.endsWith('/health/ready') ? json({}, 503) : json({ error: { code: 'internal', message: 'x' } }, 500)));
    await expect(down.listAgents()).rejects.toMatchObject({ kind: 'db_down' });
    const up = gw((url) => (url.endsWith('/health/ready') ? json({}, 200) : json({ error: { code: 'internal', message: 'boom' } }, 500)));
    await expect(up.listAgents()).rejects.toMatchObject({ code: 'internal', status: 500 });
  });

  it('404 -> not found; other 4xx parse the envelope', async () => {
    await expect(gw(() => json({}, 404)).listRuns('p')).rejects.toBeInstanceOf(GatewayNotFoundError);
    await expect(gw(() => json({ error: { code: 'validation_error', message: 'bad' } }, 422)).listRuns('p')).rejects.toMatchObject({ code: 'validation_error' });
  });

  it('malformed body -> unexpected_response', async () => {
    const g = gw(() => json({ not: 'an array' }));
    await expect(g.listAgents()).rejects.toBeInstanceOf(GatewayResponseError);
    await expect(g.listAgents()).rejects.toMatchObject({ code: 'unexpected_response' });
  });

  it('maps wire shapes onto MCP-owned records (camelCase, narrowed status)', async () => {
    const runs = gw(() => json([
      { run_id: 'r1', agent_id: 'a', agent_name: 'A', status: 'done', error: null, score: 80, ran_at: 'x', cost_usd: 1 },
      { run_id: 'r2', agent_id: null, agent_name: null, status: null, error: null, score: null, ran_at: null },
      { run_id: 'r3', agent_id: 'a', agent_name: 'A', status: 'weird', error: null, score: null, ran_at: null },
    ]));
    expect((await runs.listRuns('p')).map((r) => [r.runId, r.status])).toEqual([['r1', 'done'], ['r2', 'running'], ['r3', 'running']]);

    const reviews = gw(() => json([{ id: 'v', run_id: 'r1', agent_id: 'a', verdict: 'approve', summary: 's', score: 9, findings: [
      { id: 'f', severity: 'WARNING', category: 'bug', title: 't', file: 'a.ts', start_line: 3, end_line: 4, rationale: 'r', confidence: 0.5 },
    ] }]));
    const [rev] = await reviews.reviewsForPull('p');
    expect(rev).toMatchObject({ runId: 'r1', agentName: null });
    expect(rev?.findings[0]).toMatchObject({ startLine: 3, endLine: 4, suggestion: null });

    const conv = gw(() => json({ head_sha: 'h', conventions: [{ id: 'c', rule: 'r', evidence_path: 'p.ts', evidence_snippet: 's', evidence_line: 2, confidence: 1, accepted: true }] }));
    expect((await conv.conventions('r')).items[0]).toEqual({ id: 'c', rule: 'r', evidencePath: 'p.ts', evidenceSnippet: 's', evidenceLine: 2, confidence: 1, accepted: true });

    const repo = gw(() => json([{ id: 'x', owner: 'o', name: 'n', full_name: 'O/N' }]));
    expect(await repo.findRepo('o/n')).toEqual({ id: 'x', owner: 'o', name: 'n', fullName: 'O/N' });
  });
});
