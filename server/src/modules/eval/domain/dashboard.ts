/**
 * Eval dashboard rules (spec part 2). Pure: no I/O, no zod, no SDK. Metric
 * values are fractions in [0, 1] or `null` (no data); points are whole
 * percentage points computed on integer basis points to dodge float noise.
 */

export type DashboardRange = '7d' | '30d' | '90d' | 'all';
export type DashboardMetric = 'recall' | 'precision' | 'citation_accuracy';

export const DASHBOARD_METRICS: readonly DashboardMetric[] = ['recall', 'precision', 'citation_accuracy'];

export interface MetricValues {
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
}

export interface RunLike extends MetricValues {
  id: string;
  agent_version: number;
  /** ISO timestamp. */
  started_at: string;
  status: string;
}

export interface CostedRun extends MetricValues {
  cost_usd: number | null;
}

export interface RegressionResult {
  version: number;
  dropped: { metric: DashboardMetric; points: number }[];
  rose: DashboardMetric[];
  held: DashboardMetric[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_DAYS: Record<Exclude<DashboardRange, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 };
/** A drop of at least one whole point (100 basis points) raises the alert. */
const ALERT_THRESHOLD_BP = 100;

/** Start of the range window, or `undefined` for `all`. */
export function rangeStart(range: DashboardRange, now: Date): Date | undefined {
  if (range === 'all') return undefined;
  return new Date(now.getTime() - RANGE_DAYS[range] * DAY_MS);
}

function byStartedDesc(a: RunLike, b: RunLike): number {
  const diff = Date.parse(b.started_at) - Date.parse(a.started_at);
  if (diff !== 0) return diff;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Runs with a final scored status (`done|partial`), newest first. */
export function finishedRuns<R extends RunLike>(runs: readonly R[]): R[] {
  return runs.filter((r) => r.status === 'done' || r.status === 'partial').sort(byStartedDesc);
}

function subtract(current: number | null, previous: number | null): number | null {
  return current === null || previous === null ? null : current - previous;
}

/** Latest finished run and its per-metric delta (fractions) against the previous one. */
export function currentAndDelta<R extends RunLike>(
  runs: readonly R[],
): { current: R | null; delta: MetricValues | null } {
  const [latest, previous] = finishedRuns(runs);
  if (!latest) return { current: null, delta: null };
  if (!previous) return { current: latest, delta: null };
  return {
    current: latest,
    delta: {
      recall: subtract(latest.recall, previous.recall),
      precision: subtract(latest.precision, previous.precision),
      citation_accuracy: subtract(latest.citation_accuracy, previous.citation_accuracy),
    },
  };
}

/** Finished runs, chronological (oldest first). */
export function trend<R extends RunLike>(runs: readonly R[]): R[] {
  return finishedRuns(runs).reverse();
}

/** Last `limit` non-null recall values of finished runs, chronological. */
export function recallSparkline(runs: readonly RunLike[], limit = 10): number[] {
  const values = trend(runs)
    .map((r) => r.recall)
    .filter((v): v is number => v !== null);
  return values.slice(-limit);
}

const toBp = (v: number): number => Math.round(v * 10000);

/**
 * Compares the latest finished run with the previous one. A metric "dropped"
 * when it fell by >= 1 point (inclusive), "rose" when it went up, otherwise
 * "held". Metrics with `null` on either side are excluded. Returns `null`
 * when a run is missing or nothing dropped.
 */
export function regressionAlert(
  latest: RunLike | null | undefined,
  previous: RunLike | null | undefined,
): RegressionResult | null {
  if (!latest || !previous) return null;
  const dropped: RegressionResult['dropped'] = [];
  const rose: DashboardMetric[] = [];
  const held: DashboardMetric[] = [];
  for (const metric of DASHBOARD_METRICS) {
    const now = latest[metric];
    const before = previous[metric];
    if (now === null || before === null) continue;
    const diffBp = toBp(now) - toBp(before);
    if (diffBp <= -ALERT_THRESHOLD_BP) {
      dropped.push({ metric, points: Math.round(-diffBp / 100) });
    } else if (diffBp > 0) {
      rose.push(metric);
    } else {
      held.push(metric);
    }
  }
  if (dropped.length === 0) return null;
  return { version: latest.agent_version, dropped, rose, held };
}

/** Orders two runs by start time (earlier first); equal times keep input order. */
export function orderPair<R extends { started_at: string }>(a: R, b: R): [R, R] {
  return Date.parse(b.started_at) < Date.parse(a.started_at) ? [b, a] : [a, b];
}

/** `later - earlier` per metric and cost; `null` when either side is `null`. */
export function compareDeltas(
  earlier: CostedRun,
  later: CostedRun,
): MetricValues & { cost_usd: number | null } {
  return {
    recall: subtract(later.recall, earlier.recall),
    precision: subtract(later.precision, earlier.precision),
    citation_accuracy: subtract(later.citation_accuracy, earlier.citation_accuracy),
    cost_usd: subtract(later.cost_usd, earlier.cost_usd),
  };
}
