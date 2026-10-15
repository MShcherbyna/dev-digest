import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  aggregateRun,
  caseMetrics,
  expectedCount,
  matches,
  scoreCase,
  type CaseRecord,
  type ExpectedLike,
  type FindingLike,
} from '../src/modules/eval/domain/scoring.js';

const f = (file: string, s: number, e = s): FindingLike => ({ file, start_line: s, end_line: e });
const mf = (file: string, s: number, e?: number): ExpectedLike => ({ expect: 'must_find', file, start_line: s, end_line: e });
const mn = (file: string, s: number, e?: number): ExpectedLike => ({ expect: 'must_not_flag', file, start_line: s, end_line: e });

describe('eval scoring: matches (AC-21)', () => {
  it.each([
    ['same single line', f('a.ts', 5), mf('a.ts', 5), true],
    ['touching at item end', f('a.ts', 10, 12), mf('a.ts', 5, 10), true],
    ['touching at item start', f('a.ts', 1, 5), mf('a.ts', 5, 10), true],
    ['finding after item by one', f('a.ts', 11, 12), mf('a.ts', 5, 10), false],
    ['finding before item by one', f('a.ts', 1, 4), mf('a.ts', 5, 10), false],
    ['finding contains item', f('a.ts', 1, 100), mf('a.ts', 5), true],
    ['missing end_line = start_line (hit)', f('a.ts', 5, 9), mf('a.ts', 9), true],
    ['missing end_line = start_line (miss)', f('a.ts', 5, 8), mf('a.ts', 9), false],
    ['different path', f('b.ts', 5), mf('a.ts', 5), false],
    ['path is exact, not a suffix', f('src/a.ts', 5), mf('a.ts', 5), false],
  ])('%s', (_n, finding, item, want) => {
    // Regression: tolerance/off-by-one in the overlap rule silently shifts every metric.
    expect(matches(finding, item)).toBe(want);
  });

  it('E-10: a full-file kind finding matches by its stated line range like any other', () => {
    // Regression: scoring must not special-case kinds; it only sees file + range.
    expect(matches(f('a.ts', 1, 400), mf('a.ts', 120))).toBe(true);
    expect(matches(f('a.ts', 1, 100), mf('a.ts', 120))).toBe(false);
  });
});

describe('eval scoring: scoreCase pass table (AC-22)', () => {
  const table: Array<[string, ExpectedLike[], FindingLike[], boolean]> = [
    ['must_find matched', [mf('a.ts', 5)], [f('a.ts', 5)], true],
    ['must_find missed', [mf('a.ts', 5)], [f('a.ts', 99)], false],
    ['must_find missed with no findings', [mf('a.ts', 5)], [], false],
    ['one of two must_find missed', [mf('a.ts', 5), mf('a.ts', 50)], [f('a.ts', 5)], false],
    ['only must_not_flag, no findings', [mn('a.ts', 5)], [], true],
    ['only must_not_flag, other finding (unlabelled)', [mn('a.ts', 5)], [f('a.ts', 70)], true],
    ['only must_not_flag, hit', [mn('a.ts', 5)], [f('a.ts', 5)], false],
    ['must_find matched but must_not_flag hit', [mf('a.ts', 5), mn('a.ts', 50)], [f('a.ts', 5), f('a.ts', 50)], false],
    ['empty array, zero findings', [], [], true],
    ['empty array, any finding', [], [f('a.ts', 1)], false],
  ];
  it.each(table)('%s', (_n, items, kept, pass) => {
    // Regression: pass/fail drives "x / y passing" and the per-case status.
    expect(scoreCase(items, kept).pass).toBe(pass);
  });
});

describe('eval scoring: scoreCase counts', () => {
  it('E-8: one finding overlapping two must_find items matches both for recall and counts once as positive', () => {
    const s = scoreCase([mf('a.ts', 5), mf('a.ts', 6)], [f('a.ts', 5, 6)]);
    expect(s).toMatchObject({ mustFindTotal: 2, mustFindMatched: 2, positiveFindings: 1, negativeFindings: 0, pass: true });
  });

  it('E-9: two findings on one must_find item: item counts once for recall, both count as positive', () => {
    const s = scoreCase([mf('a.ts', 5)], [f('a.ts', 5), f('a.ts', 5)]);
    expect(s).toMatchObject({ mustFindTotal: 1, mustFindMatched: 1, positiveFindings: 2, negativeFindings: 0 });
  });

  it('unlabelled findings are in neither bucket; empty-array case makes every finding negative', () => {
    // Regression: unlabelled findings must not depress precision (AC-23).
    expect(scoreCase([mf('a.ts', 5)], [f('a.ts', 5), f('z.ts', 1)])).toMatchObject({
      positiveFindings: 1,
      negativeFindings: 0,
      gotCount: 2,
    });
    expect(scoreCase([], [f('a.ts', 1), f('b.ts', 2)])).toMatchObject({ positiveFindings: 0, negativeFindings: 2 });
  });

  it('N-1: a finding matching both must_find and must_not_flag counts once, as positive, but the case fails', () => {
    // Regression: double counting would inflate the numerator and the denominator.
    const s = scoreCase([mf('a.ts', 5), mn('a.ts', 5)], [f('a.ts', 5)]);
    expect(s).toMatchObject({ mustFindMatched: 1, positiveFindings: 1, negativeFindings: 0, pass: false });
  });

  it('expectedCount counts only must_find items', () => {
    expect(expectedCount([mf('a', 1), mn('a', 2), mf('a', 3)])).toBe(2);
    expect(expectedCount([])).toBe(0);
  });
});

const rec = (over: Partial<CaseRecord> = {}): CaseRecord => ({
  errored: false,
  mustFindTotal: 0,
  mustFindMatched: 0,
  positiveFindings: 0,
  negativeFindings: 0,
  keptCount: 0,
  droppedCount: 0,
  pass: true,
  costUsd: 0,
  ...over,
});

describe('eval scoring: aggregateRun (AC-23)', () => {
  it('fixture with exact values: sums, ratios, pass count, cost', () => {
    // Regression: metrics must be ratios of SUMS across cases, not means of per-case ratios.
    const agg = aggregateRun([
      rec({ mustFindTotal: 2, mustFindMatched: 1, positiveFindings: 1, negativeFindings: 1, keptCount: 3, droppedCount: 1, pass: false, costUsd: 0.25 }),
      rec({ mustFindTotal: 1, mustFindMatched: 1, positiveFindings: 2, negativeFindings: 0, keptCount: 2, droppedCount: 0, pass: true, costUsd: 0.5 }),
    ]);
    expect(agg).toEqual({
      status: 'done',
      casesExecuted: 2,
      casesErrored: 0,
      casesPassed: 1,
      recall: 2 / 3,
      precision: 3 / 4,
      citationAccuracy: 5 / 6,
      costUsd: 0.75,
    });
  });

  it('E-6: only must_not_flag cases: recall null, precision null unless hit (then 0), citation computed', () => {
    const clean = aggregateRun([rec({ keptCount: 2, droppedCount: 0 })]);
    expect(clean.recall).toBeNull();
    expect(clean.precision).toBeNull();
    expect(clean.citationAccuracy).toBe(1);
    const hit = aggregateRun([rec({ negativeFindings: 1, keptCount: 1, droppedCount: 1, pass: false })]);
    expect(hit.precision).toBe(0);
    expect(hit.citationAccuracy).toBe(0.5);
  });

  it('E-7: zero findings on every case: precision and citation null, recall 0, must_not_flag/empty cases pass', () => {
    const agg = aggregateRun([
      rec({ mustFindTotal: 2, mustFindMatched: 0, pass: false }),
      rec({ pass: true }),
    ]);
    expect(agg).toMatchObject({ recall: 0, precision: null, citationAccuracy: null, casesPassed: 1 });
  });

  it('a null executed-case cost makes the run cost null', () => {
    expect(aggregateRun([rec({ costUsd: 1 }), rec({ costUsd: null })]).costUsd).toBeNull();
  });

  it('status: some errored -> partial, metrics over executed only (N-2: errored cost excluded); all errored -> failed with null metrics', () => {
    // Regression: errored cases (zeros) must not dilute recall or null out cost.
    const partial = aggregateRun([
      rec({ mustFindTotal: 1, mustFindMatched: 1, positiveFindings: 1, keptCount: 1, costUsd: 0.1 }),
      rec({ errored: true, mustFindTotal: 5, costUsd: null, pass: false }),
    ]);
    expect(partial).toMatchObject({ status: 'partial', casesExecuted: 1, casesErrored: 1, casesPassed: 1, recall: 1, precision: 1, costUsd: 0.1 });

    const failed = aggregateRun([rec({ errored: true }), rec({ errored: true })]);
    expect(failed).toEqual({
      status: 'failed',
      casesExecuted: 0,
      casesErrored: 2,
      casesPassed: 0,
      recall: null,
      precision: null,
      citationAccuracy: null,
      costUsd: null,
    });
  });

  it('caseMetrics gives per-case ratios and null on a zero denominator', () => {
    expect(caseMetrics({ mustFindTotal: 0, mustFindMatched: 0, positiveFindings: 0, negativeFindings: 0, keptCount: 0, droppedCount: 0 })).toEqual({
      recall: null, precision: null, citationAccuracy: null,
    });
    expect(caseMetrics({ mustFindTotal: 4, mustFindMatched: 1, positiveFindings: 1, negativeFindings: 1, keptCount: 3, droppedCount: 1 })).toEqual({
      recall: 0.25, precision: 0.5, citationAccuracy: 0.75,
    });
  });
});

describe('eval scoring: makes no model call (L06)', () => {
  const src = readFileSync(new URL('../src/modules/eval/domain/scoring.ts', import.meta.url), 'utf8');

  it('the scoring module imports nothing, so no LLM/SDK/network/DB can be reached from it', () => {
    // Regression: scoring is a pure function of (expected, findings). A future import of a model
    // adapter, SDK or fetch here would make recall/precision non-deterministic and cost money per run.
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/\brequire\(|\bimport\(|\bfetch\(/);
  });

  it('is deterministic: the same inputs always give the same score', () => {
    const items = [mf('a.ts', 5, 9), mn('a.ts', 50)];
    const kept = [f('a.ts', 7), f('b.ts', 1)];
    expect(scoreCase(items, kept)).toEqual(scoreCase(items, kept));
  });
});
