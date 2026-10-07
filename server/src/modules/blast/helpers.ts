import type { DownstreamImpact } from '@devdigest/shared';
import { MAX_CALLERS_PER_SYMBOL, type BlastResult, type IndexState } from '../repo-intel/index.js';
import type { BlastRadiusView, BlastReason } from './ports.js';

type Facts = NonNullable<BlastResult['factsByFile']>;

/**
 * Flat callers -> one group per distinct `viaSymbol`.
 *  - A caller living in the symbol's own declaring file is dropped (callers are cross-file).
 *  - Callers inside a group are sorted by file rank desc (stable), deduped on file|line|name,
 *    and capped at `MAX_CALLERS_PER_SYMBOL` per symbol (the facade itself only caps the whole
 *    PR's list, so this guarantees the per-symbol bound; it cannot raise a symbol's share).
 *  - Groups are ordered by their best caller rank desc, then caller count desc (all ranks are 0
 *    on the ripgrep path, so count decides), then changed-symbol order. Groups with no callers
 *    are not emitted. `rank` is internal and not sent to the client.
 */
export function groupCallers(result: BlastResult): DownstreamImpact[] {
  const declFiles = new Map<string, Set<string>>();
  for (const s of result.changedSymbols) {
    const files = declFiles.get(s.name) ?? new Set<string>();
    files.add(s.file);
    declFiles.set(s.name, files);
  }

  const groups = new Map<string, { rows: BlastResult['callers']; seen: Set<string> }>();
  for (const c of result.callers) {
    if (declFiles.get(c.viaSymbol)?.has(c.file)) continue;
    let g = groups.get(c.viaSymbol);
    if (!g) {
      g = { rows: [], seen: new Set() };
      groups.set(c.viaSymbol, g);
    }
    const key = `${c.file}|${c.line}|${c.symbol}`;
    if (g.seen.has(key)) continue;
    g.seen.add(key);
    g.rows.push(c);
  }

  const order: string[] = [];
  for (const s of result.changedSymbols) if (!order.includes(s.name)) order.push(s.name);
  for (const name of groups.keys()) if (!order.includes(name)) order.push(name);

  const ranked = order.flatMap((symbol, position) => {
    const g = groups.get(symbol);
    if (!g || g.rows.length === 0) return [];
    const rows = [...g.rows].sort((a, b) => b.rank - a.rank).slice(0, MAX_CALLERS_PER_SYMBOL);
    return [{ symbol, rows, position, best: rows[0]!.rank }];
  });
  ranked.sort((a, b) => b.best - a.best || b.rows.length - a.rows.length || a.position - b.position);

  return ranked.map(({ symbol, rows }) => {
    const callers = rows.map((c) => ({ name: c.symbol, file: c.file, line: c.line }));
    const { endpoints_affected, crons_affected } = collectFacts(callers, result.factsByFile);
    return { symbol, callers, endpoints_affected, crons_affected };
  });
}

/** Union of endpoints/crons over the caller files; `[]` when no per-file facts exist (no guessing). */
export function collectFacts(
  callers: { file: string }[],
  factsByFile: Facts | undefined,
): { endpoints_affected: string[]; crons_affected: string[] } {
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  if (factsByFile) {
    for (const c of callers) {
      const f = factsByFile[c.file];
      if (!f) continue;
      for (const e of f.endpoints) endpoints.add(e);
      for (const k of f.crons) crons.add(k);
    }
  }
  return { endpoints_affected: [...endpoints], crons_affected: [...crons] };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function buildSummary(
  view: Pick<BlastRadiusView, 'changed_symbols' | 'downstream' | 'degraded' | 'reason'>,
): string {
  const symbols = view.changed_symbols.length;
  const callers = view.downstream.reduce((n, d) => n + d.callers.length, 0);
  const endpoints = new Set(view.downstream.flatMap((d) => d.endpoints_affected)).size;
  const crons = new Set(view.downstream.flatMap((d) => d.crons_affected)).size;
  const base =
    callers === 0
      ? `${plural(symbols, 'changed symbol', 'changed symbols')}, no downstream callers found.`
      : [
          plural(symbols, 'symbol', 'symbols'),
          plural(callers, 'caller', 'callers'),
          plural(endpoints, 'endpoint', 'endpoints'),
          plural(crons, 'cron', 'crons'),
        ].join(' · ');
  return view.degraded ? `${base} (index incomplete: ${view.reason ?? 'unknown'})` : base;
}

export function deriveDegradation(input: {
  result: Pick<BlastResult, 'degraded' | 'reason'>;
  state: Pick<IndexState, 'status'>;
  intelEnabled: boolean;
}): { degraded: boolean; reason: BlastReason | null } {
  const { result, state, intelEnabled } = input;
  if (!intelEnabled) return { degraded: true, reason: 'flag_off' };
  if (result.degraded !== true && state.status === 'partial') {
    return { degraded: true, reason: 'index_partial' };
  }
  if (result.degraded === true && state.status === 'failed') {
    return { degraded: true, reason: 'index_failed' };
  }
  if (result.degraded === true) return { degraded: true, reason: result.reason ?? 'no_data' };
  return { degraded: false, reason: null };
}

export function toBlastRadiusView(
  result: BlastResult,
  state: Pick<IndexState, 'status' | 'lastIndexedSha'>,
  intelEnabled: boolean,
): BlastRadiusView {
  const { degraded, reason } = deriveDegradation({ result, state, intelEnabled });
  const view = {
    changed_symbols: result.changedSymbols.map((s) => ({ name: s.name, file: s.file, kind: s.kind })),
    downstream: groupCallers(result),
    degraded,
    reason,
    ref_sha: state.lastIndexedSha || null,
  };
  return { ...view, summary: buildSummary(view) };
}

export function emptyView(reason: BlastReason): BlastRadiusView {
  const view = { changed_symbols: [], downstream: [], degraded: true, reason, ref_sha: null };
  return { ...view, summary: buildSummary(view) };
}
