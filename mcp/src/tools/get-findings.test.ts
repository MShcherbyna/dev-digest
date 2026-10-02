import { afterEach, describe, expect, it } from 'vitest';
import { finding, makeFake, review } from '../../test/helpers/fake-gateway.js';
import { connect, structured, textOf, type Harness } from '../../test/helpers/harness.js';
import type { RunRecord, RunStatus } from '../gateway/ports.js';

let h: Harness;
afterEach(() => h.close());

const run = (id: string, agentId: string, status: RunStatus): RunRecord => ({
  runId: id, agentId, agentName: 'Security Reviewer', status, error: status === 'failed' ? 'bad key' : null, score: 55,
});
const RUN1 = '3f2b8c1e-5d4a-4e7b-9c1d-2a6b8f0e4d11';
const RUN2 = '3f2b8c1e-5d4a-4e7b-9c1d-2a6b8f0e4d22';

type Res = {
  status: string; verdict: string | null; total: number; next_cursor: string | null; next_step: string | null; run_id: string | null;
  counts: { critical: number }; findings: { id: string; severity: string; rationale?: string; suggestion?: string }[];
};

const fixture = () =>
  makeFake({
    runs: [run(RUN1, 'a1', 'done')],
    reviews: [review(RUN1, [finding(1, 'SUGGESTION'), finding(2, 'CRITICAL'), finding(3, 'WARNING'), finding(4, 'WARNING')])],
  });

describe('get_findings', () => {
  it('returns the latest done run sorted by severity, paginated across pages', async () => {
    h = await connect(fixture());
    const p1 = structured<Res>(await h.call('get_findings', { repo: 'acme/payments-api', pr: 482, limit: 3 }));
    expect(p1.status).toBe('done');
    expect(p1.verdict).toBe('request_changes');
    expect(p1.findings.map((f) => f.severity)).toEqual(['CRITICAL', 'WARNING', 'WARNING']);
    expect(p1.total).toBe(4);
    expect(p1.next_cursor).not.toBeNull();
    const p2 = structured<Res>(await h.call('get_findings', { repo: 'acme/payments-api', pr: 482, limit: 3, cursor: p1.next_cursor as string }));
    expect(p2.findings).toHaveLength(1);
    expect(p2.next_cursor).toBeNull();
  });

  it('rejects an invalid cursor with a recovery message', async () => {
    h = await connect(fixture());
    const r = await h.call('get_findings', { repo: 'acme/payments-api', pr: 482, cursor: 'garbage' });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain('omit cursor');
  });

  it('include_details toggles suggestion and full rationale', async () => {
    h = await connect(fixture());
    const lean = structured<Res>(await h.call('get_findings', { repo: 'acme/payments-api', pr: 482 }));
    expect(lean.findings[0]?.suggestion).toBeUndefined();
    const full = structured<Res>(await h.call('get_findings', { repo: 'acme/payments-api', pr: 482, include_details: true }));
    expect(full.findings[0]?.suggestion).toBeDefined();
    expect((full.findings[0]?.rationale ?? '').length).toBeGreaterThan((lean.findings[0]?.rationale ?? '').length);
  });

  it('min_severity filters but counts cover the whole review', async () => {
    h = await connect(fixture());
    const r = structured<Res>(await h.call('get_findings', { repo: 'acme/payments-api', pr: 482, min_severity: 'CRITICAL' }));
    expect(r.total).toBe(1);
    expect(r.counts.critical).toBe(1);
  });

  it('status none when there are no runs (not an error)', async () => {
    h = await connect();
    const r = await h.call('get_findings', { repo: 'acme/payments-api', pr: 482 });
    expect(r.isError).toBeFalsy();
    expect(structured<Res>(r).status).toBe('none');
    expect(structured<Res>(r).next_step).toContain('run_agent_on_pr');
  });

  it('running run returns status running; failed run is an error', async () => {
    h = await connect(makeFake({ runs: [run(RUN1, 'a1', 'running')] }));
    expect(structured<Res>(await h.call('get_findings', { repo: 'acme/payments-api', pr: 482 })).status).toBe('running');
    await h.close();
    h = await connect(makeFake({ runs: [run(RUN1, 'a1', 'failed')] }));
    const r = await h.call('get_findings', { repo: 'acme/payments-api', pr: 482 });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain('Settings');
  });

  it('foreign run_id is a business error; agent filter picks that agent\'s run', async () => {
    h = await connect(makeFake({ runs: [run(RUN1, 'a2', 'done'), run(RUN2, 'a1', 'done')], reviews: [review(RUN2, [finding(1)])] }));
    const foreign = await h.call('get_findings', { repo: 'acme/payments-api', pr: 482, run_id: '3f2b8c1e-5d4a-4e7b-9c1d-2a6b8f0e4d99' });
    expect(foreign.isError).toBe(true);
    const byAgent = structured<Res>(await h.call('get_findings', { repo: 'acme/payments-api', pr: 482, agent: 'security-reviewer' }));
    expect(byAgent.run_id).toBe(RUN2);
  });

  it('a newer failed run does not mask an older done run; with no done run the newest is reported', async () => {
    h = await connect(makeFake({ runs: [run(RUN2, 'a1', 'failed'), run(RUN1, 'a1', 'done')], reviews: [review(RUN1, [finding(1)])] }));
    const r = structured<Res>(await h.call('get_findings', { repo: 'acme/payments-api', pr: 482 }));
    expect(r.status).toBe('done');
    expect(r.run_id).toBe(RUN1);
    await h.close();
    h = await connect(makeFake({ runs: [run(RUN2, 'a1', 'failed'), run(RUN1, 'a1', 'cancelled')] }));
    expect((await h.call('get_findings', { repo: 'acme/payments-api', pr: 482 })).isError).toBe(true);
  });
});
