/**
 * Deterministic eval scoring (spec 4.3). Pure: no I/O, no zod, no SDK.
 * Matching is exact `file` equality plus inclusive line-range overlap, against
 * grounded findings only.
 */

export interface ExpectedLike {
  expect: 'must_find' | 'must_not_flag';
  file: string;
  start_line: number;
  end_line?: number | undefined;
}

export interface FindingLike {
  file: string;
  start_line: number;
  end_line: number;
}

export interface CaseScore {
  /** Number of `must_find` items. */
  expectedCount: number;
  mustFindTotal: number;
  mustFindMatched: number;
  positiveFindings: number;
  negativeFindings: number;
  gotCount: number;
  pass: boolean;
}

export type RunStatus = 'done' | 'partial' | 'failed';

/** Finished per-case record as the run aggregate sees it. */
export interface CaseRecord {
  errored: boolean;
  mustFindTotal: number;
  mustFindMatched: number;
  positiveFindings: number;
  negativeFindings: number;
  keptCount: number;
  droppedCount: number;
  pass: boolean;
  costUsd: number | null;
}

export interface RunAggregate {
  status: RunStatus;
  casesExecuted: number;
  casesErrored: number;
  casesPassed: number;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  costUsd: number | null;
}

/** Inclusive overlap on the same file; a missing `end_line` equals `start_line`. */
export function matches(finding: FindingLike, item: ExpectedLike): boolean {
  if (finding.file !== item.file) return false;
  const itemEnd = item.end_line ?? item.start_line;
  return finding.start_line <= itemEnd && item.start_line <= finding.end_line;
}

export function expectedCount(items: readonly ExpectedLike[]): number {
  return items.filter((i) => i.expect === 'must_find').length;
}

export function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

/**
 * Score one case. A finding matching a `must_find` item is positive even if it
 * also matches a `must_not_flag` item (must_find precedence); such a case still
 * fails because a `must_not_flag` item was hit. Findings that match no item are
 * unlabelled and counted in neither bucket, except in an empty-array case where
 * every grounded finding is negative.
 */
export function scoreCase(
  items: readonly ExpectedLike[],
  kept: readonly FindingLike[],
): CaseScore {
  const mustFind = items.filter((i) => i.expect === 'must_find');
  const mustNot = items.filter((i) => i.expect === 'must_not_flag');
  const emptyCase = items.length === 0;

  const mustFindMatched = mustFind.filter((i) => kept.some((f) => matches(f, i))).length;

  let positive = 0;
  let negative = 0;
  let hitsMustNot = false;
  for (const f of kept) {
    const isPositive = mustFind.some((i) => matches(f, i));
    const isMustNot = mustNot.some((i) => matches(f, i));
    if (isMustNot) hitsMustNot = true;
    if (isPositive) positive++;
    else if (isMustNot || emptyCase) negative++;
  }

  const pass =
    mustFindMatched === mustFind.length && !hitsMustNot && (!emptyCase || kept.length === 0);

  return {
    expectedCount: mustFind.length,
    mustFindTotal: mustFind.length,
    mustFindMatched,
    positiveFindings: positive,
    negativeFindings: negative,
    gotCount: kept.length,
    pass,
  };
}

/** Per-case metrics stored on the result row; `null` when the denominator is 0. */
export function caseMetrics(r: Pick<CaseRecord, 'mustFindTotal' | 'mustFindMatched' | 'positiveFindings' | 'negativeFindings' | 'keptCount' | 'droppedCount'>) {
  return {
    recall: ratio(r.mustFindMatched, r.mustFindTotal),
    precision: ratio(r.positiveFindings, r.positiveFindings + r.negativeFindings),
    citationAccuracy: ratio(r.keptCount, r.keptCount + r.droppedCount),
  };
}

/**
 * Run aggregate over executed (non-error) cases. Errored cases are excluded
 * from every metric and from the cost. Cost is `null` if any executed case cost
 * is `null`. Status: no errors -> done, some -> partial, all (or none executed) -> failed.
 */
export function aggregateRun(records: readonly CaseRecord[]): RunAggregate {
  const executed = records.filter((r) => !r.errored);
  const casesErrored = records.length - executed.length;
  const sum = (pick: (r: CaseRecord) => number) => executed.reduce((n, r) => n + pick(r), 0);

  const status: RunStatus =
    casesErrored === 0 ? 'done' : executed.length === 0 ? 'failed' : 'partial';

  if (status === 'failed') {
    return {
      status,
      casesExecuted: 0,
      casesErrored,
      casesPassed: 0,
      recall: null,
      precision: null,
      citationAccuracy: null,
      costUsd: null,
    };
  }

  const positive = sum((r) => r.positiveFindings);
  const kept = sum((r) => r.keptCount);
  const costs = executed.map((r) => r.costUsd);
  return {
    status,
    casesExecuted: executed.length,
    casesErrored,
    casesPassed: executed.filter((r) => r.pass).length,
    recall: ratio(sum((r) => r.mustFindMatched), sum((r) => r.mustFindTotal)),
    precision: ratio(positive, positive + sum((r) => r.negativeFindings)),
    citationAccuracy: ratio(kept, kept + sum((r) => r.droppedCount)),
    costUsd: costs.some((c) => c === null)
      ? null
      : costs.reduce<number>((n, c) => n + (c ?? 0), 0),
  };
}
