import { describe, expect, it, vi } from 'vitest';
import type { DevDigestGateway, RunRecord, RunStatus } from '../gateway/ports.js';
import { waitForRun } from './wait-for-run.js';

const run = (status: RunStatus, error: string | null = null): RunRecord => ({
  runId: 'r1', agentId: 'a1', agentName: 'A', status, error, score: null,
});

function gw(statuses: RunStatus[]): DevDigestGateway & { calls: number } {
  let i = 0;
  const g = {
    calls: 0,
    listRuns: async () => {
      g.calls++;
      const s = statuses[Math.min(i++, statuses.length - 1)] ?? 'running';
      return [run(s, s === 'failed' ? 'boom' : null)];
    },
  };
  return g as unknown as DevDigestGateway & { calls: number };
}

function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => { t += ms; } };
}

describe('waitForRun', () => {
  it('returns done after N polls and reports progress only while running', async () => {
    const c = clock();
    const progress = vi.fn();
    const g = gw(['running', 'running', 'done']);
    const r = await waitForRun({ gateway: g, prId: 'p', runId: 'r1', waitMs: 60_000, pollMs: 3000, onProgress: progress, ...c });
    expect(r.status).toBe('done');
    expect(g.calls).toBe(3);
    expect(progress).toHaveBeenCalledTimes(2);
  });

  it('returns running when the budget elapses', async () => {
    const c = clock();
    const r = await waitForRun({ gateway: gw(['running']), prId: 'p', runId: 'r1', waitMs: 9000, pollMs: 3000, ...c });
    expect(r.status).toBe('running');
  });

  it('surfaces failed with the error text', async () => {
    const c = clock();
    const r = await waitForRun({ gateway: gw(['failed']), prId: 'p', runId: 'r1', waitMs: 9000, pollMs: 3000, ...c });
    expect(r).toEqual({ status: 'failed', error: 'boom' });
  });

  it('stops polling when aborted', async () => {
    const ac = new AbortController();
    const g = gw(['running']);
    const r = await waitForRun({
      gateway: g, prId: 'p', runId: 'r1', waitMs: 600_000, pollMs: 3000, signal: ac.signal,
      now: () => 0,
      sleep: async () => { ac.abort(); },
    });
    expect(r.status).toBe('running');
    expect(g.calls).toBe(1);
  });

  it('sends no progress without a callback', async () => {
    const c = clock();
    const r = await waitForRun({ gateway: gw(['running', 'done']), prId: 'p', runId: 'r1', waitMs: 60_000, pollMs: 3000, ...c });
    expect(r.status).toBe('done');
  });
});
