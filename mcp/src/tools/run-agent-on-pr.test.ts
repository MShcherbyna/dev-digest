import { afterEach, describe, expect, it } from 'vitest';
import { defaultSleep } from '../lib/wait-for-run.js';
import { finding, makeFake, review } from '../../test/helpers/fake-gateway.js';
import { connect, structured, textOf, type Harness } from '../../test/helpers/harness.js';

let h: Harness;
afterEach(() => h.close());

type Res = { status: string; verdict: string | null; run_id: string | null; findings: unknown[]; next_step: string | null };
const ARGS = { repo: 'acme/payments-api', pr: 482, agent: 'security-reviewer' };

describe('run_agent_on_pr', () => {
  it('done path returns verdict and findings', async () => {
    const gw = makeFake();
    h = await connect(gw);
    // the review for the first started run
    gw.state.reviews = [review('run1', [finding(1, 'CRITICAL'), finding(2)])];
    const r = await h.call('run_agent_on_pr', ARGS);
    expect(r.isError).toBeFalsy();
    const s = structured<Res>(r);
    expect(s.status).toBe('done');
    expect(s.verdict).toBe('request_changes');
    expect(s.findings).toHaveLength(2);
    expect(gw.state.startCount).toBe(1);
  });

  it('attaches to an in-flight run without starting another', async () => {
    const gw = makeFake({ runs: [{ runId: 'run0', agentId: 'a1', agentName: 'S', status: 'running', error: null, score: null }] });
    h = await connect(gw);
    const r = await h.call('run_agent_on_pr', ARGS);
    expect(gw.state.startCount).toBe(0);
    expect(structured<Res>(r).run_id).toBe('run0');
  });

  it('concurrent calls start exactly one run', async () => {
    const gw = makeFake();
    h = await connect(gw);
    await Promise.all([h.call('run_agent_on_pr', ARGS), h.call('run_agent_on_pr', ARGS)]);
    expect(gw.state.startCount).toBe(1);
  });

  it('enforces the per-session run limit', async () => {
    const gw = makeFake({ startedStatuses: ['done'] });
    h = await connect(gw, { DEVDIGEST_MCP_MAX_RUNS: '2' });
    await h.call('run_agent_on_pr', ARGS);
    await h.call('run_agent_on_pr', ARGS);
    const r = await h.call('run_agent_on_pr', ARGS);
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain('Run limit reached');
    expect(gw.state.startCount).toBe(2);
  });

  it('failed run is an isError with recovery text', async () => {
    h = await connect(makeFake({ startedStatuses: ['failed'] }));
    const r = await h.call('run_agent_on_pr', ARGS);
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain('LLM key missing');
    expect(textOf(r)).toContain('Settings');
  });

  it('wait overrun returns status running + next_step, not an error', async () => {
    h = await connect(makeFake({ startedStatuses: ['running'] }), { DEVDIGEST_MCP_RUN_WAIT_MS: '9000', DEVDIGEST_MCP_POLL_MS: '3000' });
    const r = await h.call('run_agent_on_pr', ARGS);
    expect(r.isError).toBeFalsy();
    const s = structured<Res>(r);
    expect(s.status).toBe('running');
    expect(s.findings).toEqual([]);
    expect(s.next_step).toContain('get_findings');
  });

  it('unknown agent points to list_agents', async () => {
    h = await connect();
    const r = await h.call('run_agent_on_pr', { ...ARGS, agent: 'secuirty' });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain('list_agents');
    expect(textOf(r)).toContain('Example');
  });

  it('on shutdown the in-flight wait returns status running + run_id promptly (run is not cancelled)', async () => {
    const gw = makeFake({ startedStatuses: ['running'] });
    const shutdown = new AbortController();
    h = await connect(gw, { DEVDIGEST_MCP_RUN_WAIT_MS: '600000', DEVDIGEST_MCP_POLL_MS: '60000' }, {
      shutdown: shutdown.signal,
      clock: { now: () => Date.now(), sleep: defaultSleep },
    });
    const pending = h.call('run_agent_on_pr', ARGS);
    await new Promise((r) => setTimeout(r, 100));
    const t0 = Date.now();
    shutdown.abort();
    const r = await pending;
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(r.isError).toBeFalsy();
    const s = structured<Res>(r);
    expect(s.status).toBe('running');
    expect(s.run_id).toBe('run1');
    expect(gw.state.runs[0]?.status).toBe('running');
  });
});
