import { describe, it, expect } from 'vitest';
import { selectPromptSkills, skillsLogLine } from '../src/modules/reviews/helpers.js';
import type { LinkedSkillRow } from '../src/modules/agents/repository.js';

function link(
  name: string,
  order: number,
  o: { skillEnabled?: boolean; linkEnabled?: boolean; source?: string } = {},
): LinkedSkillRow {
  return {
    order,
    enabled: o.linkEnabled ?? true,
    skill: {
      name,
      body: `body of ${name}`,
      enabled: o.skillEnabled ?? true,
      source: o.source ?? 'manual',
    },
  } as unknown as LinkedSkillRow;
}

describe('selectPromptSkills', () => {
  it('keeps only skills enabled globally AND on the link', () => {
    const out = selectPromptSkills([
      link('on', 0),
      link('globally-off', 1, { skillEnabled: false }),
      link('link-off', 2, { linkEnabled: false }),
    ]);
    expect(out.map((s) => s.name)).toEqual(['on']);
  });

  it('respects ascending link order', () => {
    const out = selectPromptSkills([link('c', 2), link('a', 0), link('b', 1)]);
    expect(out.map((s) => s.name)).toEqual(['a', 'b', 'c']);
  });

  it('marks only manual skills as trusted', () => {
    const out = selectPromptSkills([
      link('m', 0, { source: 'manual' }),
      link('i', 1, { source: 'imported_url' }),
      link('x', 2, { source: 'extracted' }),
      link('c', 3, { source: 'community' }),
    ]);
    expect(out.map((s) => s.trusted)).toEqual([true, false, false, false]);
    expect(out[0]).toEqual({ name: 'm', body: 'body of m', trusted: true });
  });

  it('returns [] when nothing applies', () => {
    expect(selectPromptSkills([])).toEqual([]);
  });
});

describe('skillsLogLine', () => {
  it('reports the count of attached skills', () => {
    expect(skillsLogLine([{ name: 'a' }, { name: 'b' }, { name: 'c' }])).toBe(
      'skills: 3 enabled skill(s) attached',
    );
  });

  it('logs nothing when no skill applies', () => {
    expect(skillsLogLine([])).toBeUndefined();
  });
});
