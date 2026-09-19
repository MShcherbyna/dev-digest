import { describe, it, expect } from 'vitest';
import { avgCost, buildAgentStats, countByCategory, pct } from '../src/modules/agents/helpers.js';
import type { LinkedSkillRow } from '../src/modules/agents/repository.js';

const link = (id: string, name: string, skillOn: boolean, linkOn: boolean, order = 0) =>
  ({ skill: { id, name, enabled: skillOn }, order, enabled: linkOn }) as unknown as LinkedSkillRow;

describe('agent stats helpers', () => {
  it('pct rounds to one decimal, null on empty', () => {
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(1, 4)).toBe(25);
    expect(pct(0, 0)).toBeNull();
  });

  it('avgCost ignores null costs and is null when none', () => {
    expect(avgCost([])).toBeNull();
    expect(avgCost([{ costUsd: null }])).toBeNull();
    expect(avgCost([{ costUsd: 0.1 }, { costUsd: null }, { costUsd: 0.3 }])).toBeCloseTo(0.2);
  });

  it('countByCategory sorts by count desc, then name', () => {
    const f = ['b', 'a', 'a', 'c', 'c', 'c'].map((category) => ({ category }));
    expect(countByCategory(f)).toEqual([
      { category: 'c', count: 3 },
      { category: 'a', count: 2 },
      { category: 'b', count: 1 },
    ]);
  });

  it('buildAgentStats: empty -> nulls/zeros; skills enabled = skill AND link, order kept', () => {
    expect(buildAgentStats([], [], [])).toEqual({
      runs_30d: 0,
      accept_pct: null,
      avg_cost_usd: null,
      findings_30d: 0,
      skills: [],
      by_category: [],
    });
    const s = buildAgentStats(
      [{ runId: 'r', costUsd: 0.5 }],
      [
        { category: 'x', accepted: true },
        { category: 'x', accepted: false },
      ],
      [link('1', 'A', true, true), link('2', 'B', false, true), link('3', 'C', true, false)],
    );
    expect(s).toMatchObject({ runs_30d: 1, accept_pct: 50, avg_cost_usd: 0.5, findings_30d: 2 });
    expect(s.skills.map((k) => k.enabled)).toEqual([true, false, false]);
  });
});
