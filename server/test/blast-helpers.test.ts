import { describe, it, expect } from 'vitest';
import { MAX_CALLERS_PER_SYMBOL } from '../src/modules/repo-intel/index.js';
import {
  buildSummary,
  collectFacts,
  deriveDegradation,
  groupCallers,
  toBlastRadiusView,
} from '../src/modules/blast/helpers.js';
import type { BlastResult } from '../src/modules/repo-intel/index.js';

const caller = (file: string, symbol: string, viaSymbol: string, line: number) => ({
  file,
  symbol,
  viaSymbol,
  line,
  rank: 1,
});

const result = (over: Partial<BlastResult> = {}): BlastResult => ({
  changedSymbols: [
    { file: 'a.ts', name: 'alpha', kind: 'function' },
    { file: 'b.ts', name: 'beta', kind: 'class' },
    { file: 'c.ts', name: 'gamma', kind: 'function' },
  ],
  callers: [],
  impactedEndpoints: [],
  degraded: false,
  ...over,
});

describe('groupCallers', () => {
  it('groups by viaSymbol in changed-symbol order, appends unknowns, dedupes, drops empty groups', () => {
    const r = result({
      callers: [
        caller('x.ts', 'fx', 'beta', 3),
        caller('y.ts', 'fy', 'alpha', 7),
        caller('y.ts', 'fy', 'alpha', 7), // duplicate
        caller('z.ts', 'fz', 'mystery', 1), // not a changed symbol
      ],
    });
    const groups = groupCallers(r);
    expect(groups.map((g) => g.symbol)).toEqual(['alpha', 'beta', 'mystery']); // gamma has no callers
    expect(groups[0]!.callers).toEqual([{ name: 'fy', file: 'y.ts', line: 7 }]);
  });

  it('attributes endpoints/crons from caller-file facts', () => {
    const r = result({
      callers: [caller('x.ts', 'fx', 'alpha', 3)],
      factsByFile: { 'x.ts': { endpoints: ['GET /a'], crons: ['nightly'] } },
    });
    const [g] = groupCallers(r);
    expect(g!.endpoints_affected).toEqual(['GET /a']);
    expect(g!.crons_affected).toEqual(['nightly']);
  });
});

describe('collectFacts', () => {
  it('unions across caller files without duplicates', () => {
    const facts = {
      'x.ts': { endpoints: ['GET /a', 'GET /b'], crons: [] },
      'y.ts': { endpoints: ['GET /a'], crons: ['c1'] },
    };
    expect(collectFacts([{ file: 'x.ts' }, { file: 'y.ts' }, { file: 'none.ts' }], facts)).toEqual({
      endpoints_affected: ['GET /a', 'GET /b'],
      crons_affected: ['c1'],
    });
  });

  it('returns empty lists when factsByFile is undefined (no guessing)', () => {
    expect(collectFacts([{ file: 'x.ts' }], undefined)).toEqual({
      endpoints_affected: [],
      crons_affected: [],
    });
  });
});

describe('buildSummary', () => {
  const g = (symbol: string, n: number, endpoints: string[] = [], crons: string[] = []) => ({
    symbol,
    callers: Array.from({ length: n }, (_, i) => ({ name: `f${i}`, file: 'x.ts', line: i + 1 })),
    endpoints_affected: endpoints,
    crons_affected: crons,
  });
  const sym = (name: string) => ({ name, file: 'a.ts', kind: 'function' });

  it('uses plural and singular per noun, unique endpoints/crons', () => {
    const s = buildSummary({
      changed_symbols: [sym('a'), sym('b')],
      downstream: [g('a', 1, ['GET /x'], ['c']), g('b', 2, ['GET /x', 'GET /y'])],
      degraded: false,
      reason: null,
    });
    expect(s).toBe('2 symbols · 3 callers · 2 endpoints · 1 cron');
  });

  it('describes the no-callers case', () => {
    expect(
      buildSummary({ changed_symbols: [sym('a')], downstream: [], degraded: false, reason: null }),
    ).toBe('1 changed symbol, no downstream callers found.');
  });

  it('appends the degraded suffix', () => {
    expect(
      buildSummary({ changed_symbols: [], downstream: [], degraded: true, reason: 'no_data' }),
    ).toBe('0 changed symbols, no downstream callers found. (index incomplete: no_data)');
  });
});

describe('deriveDegradation', () => {
  const d = (
    result: { degraded?: boolean; reason?: 'no_data' | 'repo_too_large' },
    status: 'full' | 'partial' | 'degraded' | 'failed',
    intelEnabled = true,
  ) => deriveDegradation({ result, state: { status }, intelEnabled });

  it('flag off wins', () => {
    expect(d({ degraded: false }, 'full', false)).toEqual({ degraded: true, reason: 'flag_off' });
  });
  it('partial index with data is index_partial', () => {
    expect(d({ degraded: false }, 'partial')).toEqual({ degraded: true, reason: 'index_partial' });
  });
  it('degraded result on a failed index is index_failed', () => {
    expect(d({ degraded: true, reason: 'no_data' }, 'failed')).toEqual({
      degraded: true,
      reason: 'index_failed',
    });
  });
  it('passes the facade reason through, defaulting to no_data', () => {
    expect(d({ degraded: true, reason: 'repo_too_large' }, 'degraded')).toEqual({
      degraded: true,
      reason: 'repo_too_large',
    });
    expect(d({ degraded: true }, 'degraded')).toEqual({ degraded: true, reason: 'no_data' });
  });
  it('healthy index is not degraded', () => {
    expect(d({ degraded: false }, 'full')).toEqual({ degraded: false, reason: null });
  });
});

describe('toBlastRadiusView', () => {
  it('maps symbols, ref_sha (null when empty) and summary', () => {
    const v = toBlastRadiusView(
      result({ callers: [caller('x.ts', 'fx', 'alpha', 3)] }),
      { status: 'full', lastIndexedSha: '' },
      true,
    );
    expect(v.ref_sha).toBeNull();
    expect(v.changed_symbols).toHaveLength(3);
    expect(v.summary).toBe('3 symbols · 1 caller · 0 endpoints · 0 crons');
  });
});

describe('groupCallers — rank order, declaring file, per-symbol cap', () => {
  const rc = (file: string, symbol: string, viaSymbol: string, line: number, rank: number) => ({
    file, symbol, viaSymbol, line, rank,
  });

  it('puts a later symbol with a higher-rank caller first', () => {
    const groups = groupCallers(
      result({ callers: [rc('x.ts', 'f', 'alpha', 1, 0.1), rc('y.ts', 'g', 'gamma', 2, 0.9)] }),
    );
    expect(groups.map((g) => g.symbol)).toEqual(['gamma', 'alpha']);
  });

  it('breaks equal rank by caller count, then keeps changed-symbol order', () => {
    const byCount = groupCallers(
      result({
        callers: [
          rc('x.ts', 'f', 'alpha', 1, 0),
          rc('y.ts', 'g', 'beta', 2, 0),
          rc('z.ts', 'h', 'beta', 3, 0),
        ],
      }),
    );
    expect(byCount.map((g) => g.symbol)).toEqual(['beta', 'alpha']);

    const tie = groupCallers(
      result({ callers: [rc('x.ts', 'f', 'beta', 1, 0.5), rc('y.ts', 'g', 'alpha', 2, 0.5)] }),
    );
    expect(tie.map((g) => g.symbol)).toEqual(['alpha', 'beta']);
  });

  it('sorts callers inside a group by rank desc', () => {
    const [g] = groupCallers(
      result({ callers: [rc('x.ts', 'low', 'alpha', 1, 0.1), rc('y.ts', 'high', 'alpha', 2, 0.8)] }),
    );
    expect(g!.callers.map((c) => c.name)).toEqual(['high', 'low']);
  });

  it('never lists the declaring file among its own symbol callers', () => {
    const groups = groupCallers(
      result({ callers: [rc('a.ts', 'self', 'alpha', 5, 1), rc('x.ts', 'other', 'alpha', 6, 0.5)] }),
    );
    expect(groups[0]!.callers).toEqual([{ name: 'other', file: 'x.ts', line: 6 }]);
    const onlySelf = groupCallers(result({ callers: [rc('a.ts', 'self', 'alpha', 5, 1)] }));
    expect(onlySelf).toEqual([]);
  });

  it('caps callers per symbol at MAX_CALLERS_PER_SYMBOL from repo-intel constants', () => {
    const many = Array.from({ length: MAX_CALLERS_PER_SYMBOL + 5 }, (_, i) => rc(`f${i}.ts`, `c${i}`, 'alpha', i + 1, 1 - i / 100));
    const [g] = groupCallers(result({ callers: many }));
    expect(g!.callers).toHaveLength(MAX_CALLERS_PER_SYMBOL);
    expect(g!.callers[0]!.name).toBe('c0');
  });
});
