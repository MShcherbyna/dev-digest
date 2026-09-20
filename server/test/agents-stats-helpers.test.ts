import { describe, it, expect } from 'vitest';
import {
  avgCost,
  avgDuration,
  buildAgentStats,
  costDelta,
  countByCategory,
  dailyTrend,
  includesSkillBlock,
  memoryUsage,
  pct,
  skillUsage,
  toRecentRuns,
  weeklySeverity,
} from '../src/modules/agents/helpers.js';
import type {
  AgentRecentRunRow,
  AgentRunStatRow,
  LinkedSkillRow,
} from '../src/modules/agents/repository.js';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-20T12:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * DAY);

const link = (id: string, name: string, skillOn: boolean, linkOn: boolean, order = 0) =>
  ({ skill: { id, name, enabled: skillOn }, order, enabled: linkOn }) as unknown as LinkedSkillRow;

const run = (over: Partial<AgentRunStatRow> = {}): AgentRunStatRow => ({
  runId: 'r',
  ranAt: ago(1),
  costUsd: null,
  durationMs: null,
  skillsText: null,
  memoryPulled: null,
  ...over,
});

describe('agent stats helpers', () => {
  it('pct rounds to one decimal, null on empty', () => {
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(1, 4)).toBe(25);
    expect(pct(0, 0)).toBeNull();
  });

  it('avgCost / avgDuration ignore nulls and are null when none', () => {
    expect(avgCost([])).toBeNull();
    expect(avgCost([{ costUsd: null }])).toBeNull();
    expect(avgCost([{ costUsd: 0.1 }, { costUsd: null }, { costUsd: 0.3 }])).toBeCloseTo(0.2);
    expect(avgDuration([{ durationMs: null }])).toBeNull();
    expect(avgDuration([{ durationMs: 100 }, { durationMs: null }, { durationMs: 300 }])).toBe(200);
  });

  it('costDelta is null unless both windows have data', () => {
    expect(costDelta(0.5, 0.2)).toBeCloseTo(0.3);
    expect(costDelta(0.1, 0.4)).toBeCloseTo(-0.3);
    expect(costDelta(null, 0.2)).toBeNull();
    expect(costDelta(0.2, null)).toBeNull();
  });

  it('countByCategory sorts by count desc, then name', () => {
    const f = ['b', 'a', 'a', 'c', 'c', 'c'].map((category) => ({ category }));
    expect(countByCategory(f)).toEqual([
      { category: 'c', count: 3 },
      { category: 'a', count: 2 },
      { category: 'b', count: 1 },
    ]);
  });

  it('dailyTrend: 30 buckets oldest->newest, zeros included, out-of-window dropped', () => {
    const t = dailyTrend(
      [{ ranAt: ago(0.1) }, { ranAt: ago(0.5) }, { ranAt: ago(1.5) }, { ranAt: ago(29.5) }, { ranAt: ago(31) }],
      now,
    );
    expect(t).toHaveLength(30);
    expect(t[29]).toBe(2);
    expect(t[28]).toBe(1);
    expect(t[0]).toBe(1);
    expect(t.reduce((a, b) => a + b, 0)).toBe(4);
    expect(dailyTrend([], now)).toEqual(new Array(30).fill(0));
  });

  it('weeklySeverity: 6 buckets w1..w6, by run ranAt, zeros included', () => {
    const runAt = new Map([
      ['now', ago(1)],
      ['w5', ago(9)],
      ['old', ago(41)],
      ['ancient', ago(50)],
    ]);
    const w = weeklySeverity(
      [
        { runId: 'now', severity: 'CRITICAL' },
        { runId: 'now', severity: 'WARNING' },
        { runId: 'w5', severity: 'SUGGESTION' },
        { runId: 'old', severity: 'WARNING' },
        { runId: 'ancient', severity: 'CRITICAL' },
        { runId: 'missing', severity: 'CRITICAL' },
        { runId: 'now', severity: 'bogus' },
      ],
      runAt,
      now,
    );
    expect(w.map((x) => x.week)).toEqual(['w1', 'w2', 'w3', 'w4', 'w5', 'w6']);
    expect(w[5]).toEqual({ week: 'w6', CRITICAL: 1, WARNING: 1, SUGGESTION: 0 });
    expect(w[4]).toEqual({ week: 'w5', CRITICAL: 0, WARNING: 0, SUGGESTION: 1 });
    expect(w[0]).toEqual({ week: 'w1', CRITICAL: 0, WARNING: 1, SUGGESTION: 0 });
    expect(w[1]).toEqual({ week: 'w2', CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });

  it('includesSkillBlock matches whole `### name` lines only', () => {
    expect(includesSkillBlock('### foo\nbody', 'foo')).toBe(true);
    expect(includesSkillBlock('x\n### foo', 'foo')).toBe(true);
    expect(includesSkillBlock('### foobar\nbody', 'foo')).toBe(false);
    expect(includesSkillBlock('a ### foo', 'foo')).toBe(false);
    expect(includesSkillBlock('### a.b (x)\n', 'a.b (x)')).toBe(true);
    expect(includesSkillBlock(null, 'foo')).toBe(false);
  });

  it('skillUsage: pct of runs, 0 with no runs, enabled = skill AND link, sorted pct desc then name', () => {
    const links = [
      link('1', 'Zed', true, true),
      link('2', 'Alpha', true, true),
      link('3', 'Off', false, true),
      link('4', 'Never', true, false),
    ];
    const runs = [
      { skillsText: '### Zed\nx\n\n### Alpha\ny' },
      { skillsText: '### Zed\nx' },
      { skillsText: '### Off\nz' },
      { skillsText: null },
    ];
    expect(skillUsage(runs, links)).toEqual([
      { id: '1', name: 'Zed', enabled: true, pct: 50 },
      { id: '3', name: 'Off', enabled: false, pct: 25 },
      { id: '2', name: 'Alpha', enabled: true, pct: 25 },
      { id: '4', name: 'Never', enabled: false, pct: 0 },
    ].sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name)));
    expect(skillUsage([], links).every((s) => s.pct === 0)).toBe(true);
  });

  it('memoryUsage: pct of runs pulling each text, deduped per run, top 5, [] when none', () => {
    expect(memoryUsage([{ memoryPulled: null }, { memoryPulled: [] }])).toEqual([]);
    expect(memoryUsage([])).toEqual([]);
    const runs = [
      { memoryPulled: [{ text: 'a', pr: 1 }, { text: 'a' }, { text: 'b' }] },
      { memoryPulled: [{ text: 'a' }] },
      { memoryPulled: 'garbage' },
      { memoryPulled: [{ nope: 1 }, null] },
    ];
    expect(memoryUsage(runs)).toEqual([
      { label: 'a', pct: 50 },
      { label: 'b', pct: 25 },
    ]);
    const many = [{ memoryPulled: 'abcdefg'.split('').map((text) => ({ text })) }];
    expect(memoryUsage(many)).toHaveLength(5);
  });

  it('toRecentRuns maps tokens, nulls, ISO date and finding counts', () => {
    const base: AgentRecentRunRow = {
      runId: 'a',
      ranAt: ago(1),
      prNumber: 7,
      repoId: 'repo',
      tokensIn: 10,
      tokensOut: 5,
      costUsd: 0.1,
      source: 'ci',
    };
    const out = toRecentRuns(
      [base, { ...base, runId: 'b', prNumber: null, repoId: null, tokensIn: null, tokensOut: null, costUsd: null, source: 'local' }],
      new Map([['a', 3]]),
    );
    expect(out[0]).toEqual({
      run_id: 'a',
      ran_at: ago(1).toISOString(),
      pr_number: 7,
      repo_id: 'repo',
      tokens: 15,
      cost_usd: 0.1,
      findings: 3,
      source: 'ci',
    });
    expect(out[1]).toMatchObject({ pr_number: null, repo_id: null, tokens: null, cost_usd: null, findings: 0, source: 'local' });
  });

  it('buildAgentStats: empty -> nulls/zeros/fixed-length arrays', () => {
    const s = buildAgentStats({
      now,
      runs: [],
      findings: [],
      links: [],
      prevAvgCost: null,
      latest: [],
      findingCounts: new Map(),
    });
    expect(s).toEqual({
      runs_30d: 0,
      runs_trend: new Array(30).fill(0),
      accept_pct: null,
      avg_cost_usd: null,
      cost_delta_usd: null,
      avg_duration_ms: null,
      findings_30d: 0,
      skill_usage: [],
      memory_usage: [],
      severity_weekly: ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'].map((week) => ({
        week,
        CRITICAL: 0,
        WARNING: 0,
        SUGGESTION: 0,
      })),
      by_category: [],
      recent_runs: [],
    });
  });

  it('buildAgentStats: 30d aggregates exclude older runs, severity chart keeps 42d', () => {
    const s = buildAgentStats({
      now,
      runs: [
        run({ runId: 'in1', ranAt: ago(1), costUsd: 0.5, durationMs: 100, skillsText: '### A\n' }),
        run({ runId: 'in2', ranAt: ago(2), costUsd: null, durationMs: 300 }),
        run({ runId: 'old', ranAt: ago(35), costUsd: 9, durationMs: 9999 }),
      ],
      findings: [
        { runId: 'in1', category: 'x', severity: 'CRITICAL', accepted: true },
        { runId: 'in1', category: 'x', severity: 'WARNING', accepted: false },
        { runId: 'old', category: 'y', severity: 'WARNING', accepted: false },
      ],
      links: [link('1', 'A', true, true)],
      prevAvgCost: 0.2,
      latest: [],
      findingCounts: new Map(),
    });
    expect(s).toMatchObject({
      runs_30d: 2,
      accept_pct: 50,
      avg_cost_usd: 0.5,
      avg_duration_ms: 200,
      findings_30d: 2,
      by_category: [{ category: 'x', count: 2 }],
      skill_usage: [{ id: '1', name: 'A', enabled: true, pct: 50 }],
    });
    expect(s.cost_delta_usd).toBeCloseTo(0.3);
    expect(s.runs_trend.reduce((a, b) => a + b, 0)).toBe(2);
    expect(s.severity_weekly[0]).toMatchObject({ WARNING: 1 }); // 35d ago -> w1
    expect(s.severity_weekly[5]).toMatchObject({ CRITICAL: 1, WARNING: 1 });
  });
});
