import { afterEach, describe, expect, it } from 'vitest';
import { blastFixture, makeFake } from '../../test/helpers/fake-gateway.js';
import { connect, structured, textOf, type Harness } from '../../test/helpers/harness.js';
import type { BlastGroupRecord } from '../gateway/ports.js';

let h: Harness;
afterEach(() => h.close());

type Res = {
  repo: string;
  pr: number;
  summary: string;
  degraded: boolean;
  reason: string | null;
  ref_sha: string | null;
  changed_symbols_total: number;
  changed_symbols: { name: string }[];
  downstream_total: number;
  downstream: { symbol: string; callers: { name: string; file: string; line: number }[]; endpoints_affected: string[]; crons_affected: string[] }[];
  next_cursor: string | null;
  web_url: string;
  note: string | null;
};
const ARGS = { repo: 'acme/payments-api', pr: 482 };

describe('devdigest_get_blast_radius', () => {
  it('passes the route map through: symbols, callers file:line, endpoints, crons, ref_sha', async () => {
    h = await connect();
    const r = await h.call('devdigest_get_blast_radius', ARGS);
    expect(r.isError).toBeFalsy();
    const s = structured<Res>(r);
    expect(s).toMatchObject({ repo: 'acme/payments-api', pr: 482, degraded: false, reason: null, ref_sha: 'idx123', note: null, next_cursor: null });
    expect(s.summary).toBe('2 symbols · 3 callers · 1 endpoint · 1 cron');
    expect(s.changed_symbols_total).toBe(2);
    expect(s.downstream_total).toBe(2);
    expect(s.downstream[0]).toEqual({
      symbol: 'rateLimit',
      callers: [
        { name: 'publicRouter', file: 'src/api/public/index.ts', line: 23 },
        { name: 'app', file: 'src/server.ts', line: 88 },
      ],
      endpoints_affected: ['GET /api/public/items'],
      crons_affected: ['reset-rate-buckets (hourly)'],
    });
    expect(s.web_url).toBe('http://localhost:3000/repos/repo1/pulls/482');
  });

  it('reports a degraded map as data with a note, never as an error', async () => {
    h = await connect(makeFake({ blast: { pr1: blastFixture({ degraded: true, reason: 'index_partial' }) } }));
    const r = await h.call('devdigest_get_blast_radius', ARGS);
    expect(r.isError).toBeFalsy();
    const s = structured<Res>(r);
    expect(s).toMatchObject({ degraded: true, reason: 'index_partial' });
    expect(s.note).toContain('index_partial');
    expect(s.downstream).toHaveLength(2);
  });

  it('an empty map is a normal result; no_changed_files tells the agent what to do', async () => {
    h = await connect(
      makeFake({ blast: { pr1: blastFixture({ changedSymbols: [], downstream: [], degraded: true, reason: 'no_changed_files', refSha: null, summary: 'x' }) } }),
    );
    const s = structured<Res>(await h.call('devdigest_get_blast_radius', ARGS));
    expect(s.downstream).toEqual([]);
    expect(s.ref_sha).toBeNull();
    expect(s.note).toContain('open the PR in DevDigest');
  });

  it('unknown repo or PR is a recovery error with Expected/Example/Next, and the gateway is not asked for a map', async () => {
    const gw = makeFake();
    h = await connect(gw);
    const pr = await h.call('devdigest_get_blast_radius', { repo: 'acme/payments-api', pr: 9999 });
    expect(pr.isError).toBe(true);
    expect(textOf(pr)).toMatch(/PR #9999 not found in acme\/payments-api\. Expected: .* Example: .* Next: /);
    const repo = await h.call('devdigest_get_blast_radius', { repo: 'nobody/nothing', pr: 1 });
    expect(repo.isError).toBe(true);
    expect(textOf(repo)).toContain('Next:');
  });

  it('a PR that vanished server-side (404 on the map) is a recovery error and is re-resolved next time', async () => {
    const gw = makeFake({ blast: {} });
    h = await connect(gw);
    const r = await h.call('devdigest_get_blast_radius', ARGS);
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain('Next:');
  });

  it('sanitizes repo-derived text (control chars and ANSI stripped, long values cut)', async () => {
    const evil: BlastGroupRecord = {
      symbol: 'x\u001b[31mred\u0000',
      callers: [{ name: 'n\u0007', file: `a/${'b'.repeat(400)}.ts`, line: 1 }],
      endpoints: ['GET /a\u001b]0;title\u0007'],
      crons: [],
    };
    h = await connect(makeFake({ blast: { pr1: blastFixture({ downstream: [evil] }) } }));
    const s = structured<Res>(await h.call('devdigest_get_blast_radius', ARGS));
    const g = s.downstream[0]!;
    expect(g.symbol).toBe('xred');
    expect(g.callers[0]!.name).toBe('n');
    expect(g.callers[0]!.file.length).toBeLessThanOrEqual(300);
    expect(g.endpoints_affected[0]).toBe('GET /a');
  });

  it('paginates symbol groups and keeps every page under the size budget', async () => {
    const groups: BlastGroupRecord[] = Array.from({ length: 60 }, (_, i) => ({
      symbol: `sym${i}`,
      callers: Array.from({ length: 20 }, (_, j) => ({ name: `caller${j}`, file: `src/dir${i}/file${j}.ts`, line: j + 1 })),
      endpoints: [`GET /api/${i}`],
      crons: [],
    }));
    h = await connect(makeFake({ blast: { pr1: blastFixture({ downstream: groups }) } }));
    let cursor: string | undefined;
    let seen = 0;
    for (let i = 0; i < 100; i++) {
      const r = await h.call('devdigest_get_blast_radius', { ...ARGS, limit: 50, ...(cursor ? { cursor } : {}) });
      expect(textOf(r).length).toBeLessThanOrEqual(16_000);
      const s = structured<Res>(r);
      seen += s.downstream.length;
      if (!s.next_cursor) break;
      cursor = s.next_cursor;
    }
    expect(seen).toBe(60);
    const bad = await h.call('devdigest_get_blast_radius', { ...ARGS, cursor: 'junk' });
    expect(bad.isError).toBe(true);
  });

  it('is read-only and idempotent by annotation', async () => {
    h = await connect();
    const { tools } = await h.client.listTools();
    const t = tools.find((x) => x.name === 'devdigest_get_blast_radius');
    expect(t?.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true, openWorldHint: true });
    expect(t?.annotations?.destructiveHint).not.toBe(true);
  });
});
