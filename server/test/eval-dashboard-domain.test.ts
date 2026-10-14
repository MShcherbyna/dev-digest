import { describe, it, expect } from 'vitest';
import {
  compareDeltas,
  currentAndDelta,
  finishedRuns,
  orderPair,
  rangeStart,
  recallSparkline,
  regressionAlert,
  trend,
  type RunLike,
} from '../src/modules/eval/domain/dashboard.js';

const run = (id: string, startedAt: string, over: Partial<RunLike> = {}): RunLike => ({
  id,
  agent_version: 1,
  started_at: startedAt,
  status: 'done',
  recall: 0.8,
  precision: 0.8,
  citation_accuracy: 0.8,
  ...over,
});

describe('rangeStart (P2-AC-6)', () => {
  const now = new Date('2026-10-15T12:00:00.000Z');

  it('maps 7d/30d/90d to the window start and "all" to no lower bound', () => {
    // Regression: the range filter fed to the repository (AC-6) must be exact days back, `all` unbounded.
    expect(rangeStart('7d', now)?.toISOString()).toBe('2026-10-08T12:00:00.000Z');
    expect(rangeStart('30d', now)?.toISOString()).toBe('2026-09-15T12:00:00.000Z');
    expect(rangeStart('90d', now)?.toISOString()).toBe('2026-07-17T12:00:00.000Z');
    expect(rangeStart('all', now)).toBeUndefined();
  });
});

describe('currentAndDelta / trend / recallSparkline (P2-AC-7, P2-AC-8, E-1, E-7)', () => {
  it('uses the two latest finished runs by start time, ignoring running/failed ones', () => {
    // Regression: a newer running/failed run must not become "current" or the delta baseline (AC-7).
    const runs = [
      run('r-old', '2026-10-01T00:00:00Z', { recall: 0.5, precision: 0.6, citation_accuracy: null }),
      run('r-new', '2026-10-03T00:00:00Z', { recall: 0.75, precision: 0.5, citation_accuracy: 0.9, status: 'partial' }),
      run('r-fail', '2026-10-04T00:00:00Z', { status: 'failed', recall: null, precision: null, citation_accuracy: null }),
      run('r-live', '2026-10-05T00:00:00Z', { status: 'running' }),
    ];
    expect(finishedRuns(runs).map((r) => r.id)).toEqual(['r-new', 'r-old']);
    const { current, delta } = currentAndDelta(runs);
    expect(current?.id).toBe('r-new');
    expect(delta?.recall).toBeCloseTo(0.25);
    expect(delta?.precision).toBeCloseTo(-0.1);
    // null on either side => no delta for that metric (AC-7: "—", no delta).
    expect(delta?.citation_accuracy).toBeNull();
  });

  it('E-1: a single finished run has a current value but no delta and a one-point sparkline', () => {
    // Regression: one run must not invent a delta or an alert (E-1).
    const runs = [run('only', '2026-10-01T00:00:00Z', { recall: 0.7 })];
    expect(currentAndDelta(runs)).toMatchObject({ current: { id: 'only' }, delta: null });
    expect(recallSparkline(runs)).toEqual([0.7]);
    expect(regressionAlert(runs[0], undefined)).toBeNull();
  });

  it('E-7: only failed runs => no current, no delta, empty trend and sparkline', () => {
    // Regression: failed runs must not leak into cards/chart (cards show "—", chart empty).
    const runs = [run('f1', '2026-10-01T00:00:00Z', { status: 'failed', recall: null })];
    expect(currentAndDelta(runs)).toEqual({ current: null, delta: null });
    expect(trend(runs)).toEqual([]);
    expect(recallSparkline(runs)).toEqual([]);
  });

  it('trend is chronological and keeps null metric values; sparkline drops nulls and keeps the last N', () => {
    // Regression: AC-8 chronological series with null points left as null (not 0); AC-7 sparkline omits nulls.
    const runs = Array.from({ length: 12 }, (_, i) =>
      run(`r${i}`, `2026-10-${String(i + 1).padStart(2, '0')}T00:00:00Z`, {
        recall: i === 5 ? null : i / 20,
      }),
    );
    const t = trend(runs);
    expect(t.map((r) => r.id)).toEqual(runs.map((r) => r.id));
    expect(t[5]?.recall).toBeNull();
    const spark = recallSparkline(runs, 10);
    expect(spark).toHaveLength(10);
    expect(spark.at(-1)).toBeCloseTo(11 / 20);
    expect(spark).not.toContain(null);
  });
});

describe('regressionAlert (P2-AC-11, E-11)', () => {
  const prev = run('p', '2026-10-01T00:00:00Z', { agent_version: 6, recall: 0.8, precision: 0.8, citation_accuracy: 0.8 });
  const latest = (over: Partial<RunLike>) => run('l', '2026-10-02T00:00:00Z', { agent_version: 7, ...over });

  it('E-11: exactly 1.0 point lower raises the banner; 0.9 points does not', () => {
    // Regression: the threshold is inclusive and must be exact (no float noise at the boundary).
    const exact = regressionAlert(latest({ precision: 0.79 }), prev);
    expect(exact?.dropped).toEqual([{ metric: 'precision', points: 1 }]);
    expect(regressionAlert(latest({ precision: 0.791 }), prev)).toBeNull();
  });

  it('boundary holds for every whole-percent pair (float noise such as 0.58 - 0.57)', () => {
    // Regression: a naive `latest - previous <= -0.01` misses some 1-point drops due to IEEE-754.
    for (let a = 1; a < 100; a++) {
      const result = regressionAlert(
        latest({ recall: a / 100 }),
        run('p', '2026-10-01T00:00:00Z', { recall: (a + 1) / 100 }),
      );
      expect(result?.dropped, `${a / 100} vs ${(a + 1) / 100}`).toEqual([{ metric: 'recall', points: 1 }]);
    }
  });

  it('names every dropped metric rounded to whole points, with the latest version, rose and held lists', () => {
    // Regression: AC-11 template inputs: drops, latest version, rose/held sentence.
    const result = regressionAlert(
      latest({ recall: 0.85, precision: 0.78, citation_accuracy: 0.8 }),
      run('p', '2026-10-01T00:00:00Z', { recall: 0.8, precision: 0.8, citation_accuracy: 0.8 }),
    );
    expect(result).toEqual({
      version: 7,
      dropped: [{ metric: 'precision', points: 2 }],
      rose: ['recall'],
      held: ['citation_accuracy'],
    });

    const two = regressionAlert(latest({ recall: 0.7, precision: 0.76, citation_accuracy: 0.9 }), prev);
    expect(two?.dropped).toEqual([
      { metric: 'recall', points: 10 },
      { metric: 'precision', points: 4 },
    ]);
    expect(two?.rose).toEqual(['citation_accuracy']);
  });

  it('null on either side is excluded; a null-only drop yields no banner; <2 runs yields null', () => {
    // Regression: unknown metrics must never be reported as a drop (AC-11).
    expect(regressionAlert(latest({ recall: null, precision: 0.5, citation_accuracy: 0.8 }), prev)?.dropped).toEqual([
      { metric: 'precision', points: 30 },
    ]);
    expect(
      regressionAlert(latest({ recall: null, precision: null, citation_accuracy: null }), prev),
    ).toBeNull();
    expect(regressionAlert(null, prev)).toBeNull();
    expect(regressionAlert(latest({}), null)).toBeNull();
  });
});

describe('orderPair / compareDeltas (P2-E-2, P2-E-3)', () => {
  it('E-3: orders by start time, not version number', () => {
    // Regression: a promoted older config (v8 run started before a v7 run) must still diff chronologically.
    const v8Early = run('a', '2026-10-01T00:00:00Z', { agent_version: 8 });
    const v7Late = run('b', '2026-10-02T00:00:00Z', { agent_version: 7 });
    expect(orderPair(v7Late, v8Early).map((r) => r.id)).toEqual(['a', 'b']);
    expect(orderPair(v8Early, v7Late).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('E-2: equal start times keep input order; same-version runs are allowed', () => {
    // Regression: equal timestamps must be stable and not throw/swap.
    const x = run('x', '2026-10-01T00:00:00Z', { agent_version: 3 });
    const y = run('y', '2026-10-01T00:00:00Z', { agent_version: 3 });
    expect(orderPair(x, y).map((r) => r.id)).toEqual(['x', 'y']);
    expect(orderPair(y, x).map((r) => r.id)).toEqual(['y', 'x']);
  });

  it('deltas are later minus earlier and null when either side is null', () => {
    // Regression: tile deltas (incl. cost) in CompareModal must have the right sign and null handling.
    const d = compareDeltas(
      { recall: 0.5, precision: null, citation_accuracy: 0.9, cost_usd: 0.1 },
      { recall: 0.75, precision: 0.8, citation_accuracy: 0.8, cost_usd: null },
    );
    expect(d.recall).toBeCloseTo(0.25);
    expect(d.precision).toBeNull();
    expect(d.citation_accuracy).toBeCloseTo(-0.1);
    expect(d.cost_usd).toBeNull();
  });
});
