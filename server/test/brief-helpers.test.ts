/**
 * PR Brief pure helpers (grounding, file selection, token fitting) plus the
 * contract-level checks of the stored shape. No I/O, no fakes needed.
 */
import { describe, it, expect } from 'vitest';
import { estimateTokens } from '@devdigest/reviewer-core';
import { PrBrief, type BlastRadius, type Risk, type SmartDiffRole } from '@devdigest/shared';
import {
  blastCallerLines,
  capTextToTokens,
  fitLines,
  groundFocus,
  groundRisks,
  hunkRanges,
  isStale,
  normalizeKind,
  parseFileRef,
  selectFiles,
  type Range,
} from '../src/modules/brief/helpers.js';
import { TRUNCATED_MARKER } from '../src/modules/brief/constants.js';
import { StoredBrief } from '../src/modules/brief/schemas.js';
import type { BriefFile } from '../src/modules/brief/ports.js';

const changed = (entries: Record<string, Range[]>): Map<string, Range[]> => new Map(Object.entries(entries));
const noCallers = new Map<string, Set<number>>();

const blast = (callers: { file: string; line: number }[]): BlastRadius => ({
  changed_symbols: [],
  downstream: [
    {
      symbol: 'alpha',
      callers: callers.map((c) => ({ name: 'run', file: c.file, line: c.line })),
      endpoints_affected: [],
      crons_affected: [],
    },
  ],
  summary: 's',
});

const risk = (file_refs: string[], over: Partial<Risk> = {}): Risk => ({
  kind: 'security',
  title: 't',
  explanation: 'e',
  severity: 'high',
  file_refs,
  ...over,
});

describe('hunkRanges', () => {
  it('parses head-side ranges, defaults a missing count to 1 and ignores pure deletions', () => {
    // Catches: off-by-one ranges (start+count instead of start+count-1) that would ground focus on lines outside the hunk.
    const patch = [
      'diff --git a/x b/x',
      '@@ -1,3 +10,4 @@ fn',
      '+a',
      '@@ -20 +30 @@',
      '+b',
      '@@ -40,2 +50,0 @@',
      '-gone',
      '@@ -60,1 +70,2 @@',
    ].join('\n');
    expect(hunkRanges(patch)).toEqual([
      [10, 13],
      [30, 30],
      [70, 71],
    ]);
  });

  it('gives no ranges for a null, empty or hunk-less patch', () => {
    // Catches: a crash on binary/huge files whose patch is null.
    expect(hunkRanges(null)).toEqual([]);
    expect(hunkRanges('')).toEqual([]);
    expect(hunkRanges('Binary files differ')).toEqual([]);
  });
});

describe('parseFileRef', () => {
  it.each([
    ['src/a.ts', { path: 'src/a.ts' }],
    ['src/a.ts:12', { path: 'src/a.ts', start: 12, end: 12 }],
    ['src/a.ts:12-18', { path: 'src/a.ts', start: 12, end: 18 }],
    ['  src/a.ts:3  ', { path: 'src/a.ts', start: 3, end: 3 }],
    // Bad ranges and non-numeric suffixes fall back to the path only.
    ['src/a.ts:18-12', { path: 'src/a.ts' }],
    ['src/a.ts:0', { path: 'src/a.ts' }],
    ['src/a.ts:abc', { path: 'src/a.ts' }],
  ])('%s', (ref, expected) => {
    // Catches: a malformed model ref being treated as a line anchor, or the path losing its suffix.
    expect(parseFileRef(ref)).toEqual(expected);
  });

  it('returns null for an empty ref', () => {
    expect(parseFileRef('   ')).toBeNull();
  });
});

describe('groundFocus (AC-8, AC-36, AC-37)', () => {
  it('keeps lines inside a hunk, drops other lines, unknown files and traversal paths', () => {
    // Catches: an ungrounded focus item (hallucinated file/line, `../etc/passwd`) reaching the stored brief.
    const files = changed({ 'src/index.ts': [[20, 30]] });
    const { kept, dropped } = groundFocus(
      [
        { file: 'src/index.ts', line: 23, reason: 'in hunk' },
        { file: 'src/index.ts', line: 40, reason: 'outside hunk' },
        { file: 'src/ghost.ts', line: 1, reason: 'unknown file' },
        { file: '../etc/passwd', line: 1, reason: 'traversal' },
        { file: 'src/index.ts', line: 0, reason: 'line 0' },
        { file: 'src/index.ts', line: 21.5, reason: 'non-integer' },
      ],
      files,
      noCallers,
    );
    expect(kept.map((k) => k.reason)).toEqual(['in hunk']);
    expect(dropped).toBe(5);
  });

  it('keeps a blast-only file only on a listed caller line, and drops it when blast is unavailable', () => {
    // Catches: AC-37 - a caller anchor trusted without blast data, or any line of a blast-only file accepted.
    const callers = blastCallerLines(blast([{ file: 'src/caller.ts', line: 9 }]));
    const items = [
      { file: 'src/caller.ts', line: 9, reason: 'caller line' },
      { file: 'src/caller.ts', line: 10, reason: 'not a caller line' },
    ];
    expect(groundFocus(items, changed({}), callers).kept.map((k) => k.reason)).toEqual(['caller line']);
    expect(groundFocus(items, changed({}), blastCallerLines(null)).kept).toEqual([]);
  });

  it('uses the hunk rule (not the caller rule) for a file that is both changed and a caller', () => {
    // Catches: a changed file's caller line outside its hunk being accepted via the blast set.
    const callers = blastCallerLines(blast([{ file: 'src/a.ts', line: 500 }]));
    const { kept } = groundFocus([{ file: 'src/a.ts', line: 500, reason: 'r' }], changed({ 'src/a.ts': [[1, 10]] }), callers);
    expect(kept).toEqual([]);
  });

  it('keeps the first 5 survivors in model order when 7 are valid', () => {
    // Catches: the 5-item output cap (AC-8) not applied, or reordering of the model's priority.
    const items = Array.from({ length: 7 }, (_, i) => ({ file: 'src/a.ts', line: i + 1, reason: `r${i + 1}` }));
    const { kept, dropped } = groundFocus(items, changed({ 'src/a.ts': [[1, 100]] }), noCallers);
    expect(kept.map((k) => k.reason)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
    expect(dropped).toBe(2);
  });

  it('grounds against ALL hunks, including one beyond the five shown to the model', () => {
    // Catches: grounding done on the truncated prompt ranges instead of every hunk (valid focus wrongly dropped).
    const patch = Array.from({ length: 7 }, (_, i) => `@@ -${i * 100 + 1},2 +${i * 100 + 1},3 @@\n+x`).join('\n');
    const ranges = hunkRanges(patch);
    expect(ranges).toHaveLength(7);
    const { kept } = groundFocus([{ file: 'src/a.ts', line: 602, reason: 'seventh hunk' }], changed({ 'src/a.ts': ranges }), noCallers);
    expect(kept).toHaveLength(1);
  });
});

describe('groundRisks (AC-19, AC-20, AC-37)', () => {
  const files = changed({ 'src/a.ts': [[10, 20], [40, 50]] });

  it('reduces unprovable lines to the path, keeps provable ones, drops unknown-file refs', () => {
    // Catches: a fabricated line anchor (src/a.ts:900) being stored, or an unknown file surviving as a ref.
    const { kept, droppedRefs } = groundRisks(
      [risk(['src/a.ts:900', 'src/a.ts:12', 'src/a.ts:12-15', 'src/ghost.ts:1'])],
      files,
      noCallers,
    );
    expect(kept[0]!.file_refs).toEqual(['src/a.ts', 'src/a.ts:12', 'src/a.ts:12-15']);
    expect(droppedRefs).toBe(1);
  });

  it('keeps a range only when both ends sit in one hunk', () => {
    // Catches: a range spanning two hunks (15-45) being kept as if it were contiguous.
    const { kept } = groundRisks([risk(['src/a.ts:15-45'])], files, noCallers);
    expect(kept[0]!.file_refs).toEqual(['src/a.ts']);
  });

  it('deduplicates refs that reduce to the same path', () => {
    // Catches: duplicate chips after reduction (900 and 901 both become src/a.ts).
    const { kept } = groundRisks([risk(['src/a.ts:900', 'src/a.ts:901', 'src/a.ts'])], files, noCallers);
    expect(kept[0]!.file_refs).toEqual(['src/a.ts']);
  });

  it('accepts a blast-only file by path, and by line only when it equals one caller line', () => {
    // Catches: AC-37 - a blast-only file range being kept, or the file dropped although blast lists it.
    const callers = blastCallerLines(blast([{ file: 'src/caller.ts', line: 9 }]));
    const ok = groundRisks([risk(['src/caller.ts:9', 'src/caller.ts:9-12', 'src/caller.ts:10'])], changed({}), callers);
    expect(ok.kept[0]!.file_refs).toEqual(['src/caller.ts:9', 'src/caller.ts']);
    const without = groundRisks([risk(['src/caller.ts:9'])], changed({}), blastCallerLines(null));
    expect(without.kept).toEqual([]);
  });

  it('drops a risk left with no refs and caps at 5 risks keeping the order', () => {
    // Catches: ungrounded risks shown to the user, and the 5-risk cap (AC-19) not applied.
    const many = Array.from({ length: 6 }, (_, i) => risk(['src/a.ts'], { title: `r${i + 1}` }));
    const result = groundRisks([risk(['src/ghost.ts'], { title: 'ghost' }), ...many], files, noCallers);
    expect(result.kept.map((r) => r.title)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
    expect(result.droppedRisks).toBe(2);
  });

  it('normalises a kind outside the closed set to other (AC-20)', () => {
    // Catches: free-text model kinds leaking to the UI instead of the closed list.
    expect(normalizeKind('auth')).toBe('other');
    expect(normalizeKind('  Security ')).toBe('security');
    const { kept } = groundRisks([risk(['src/a.ts'], { kind: 'auth' })], files, noCallers);
    expect(kept[0]!.kind).toBe('other');
  });
});

describe('selectFiles (AC-30)', () => {
  it('sorts by the brief role order, stable within a role, and keeps the first 200 of 250', () => {
    // Catches: the Smart-Diff role order being used, an unstable sort, or more than 200 files sent.
    const roles: SmartDiffRole[] = [];
    const files: BriefFile[] = [];
    const add = (n: number, role: SmartDiffRole) => {
      for (let i = 0; i < n; i++) {
        const path = `${role}/f${i}.ts`;
        roles.push(role);
        files.push({ path, additions: 1, deletions: 0, patch: null });
      }
    };
    add(60, 'boilerplate');
    add(60, 'docs');
    add(60, 'tests');
    add(40, 'wiring');
    add(30, 'core');
    const roleOf = (p: string) => p.split('/')[0] as SmartDiffRole;
    const { selected, total } = selectFiles(files, roleOf);
    expect(total).toBe(250);
    expect(selected).toHaveLength(200);
    expect(selected[0]!.path).toBe('core/f0.ts');
    expect(selected[29]!.role).toBe('core');
    expect(selected[30]!.role).toBe('wiring');
    expect(selected[70]!.role).toBe('tests');
    expect(selected[130]!.role).toBe('docs');
    expect(selected.at(-1)!.role).toBe('boilerplate');
    expect(selected.filter((f) => f.role === 'boilerplate')).toHaveLength(10);
    // stable inside a role
    expect(selected.filter((f) => f.role === 'tests').map((f) => f.path.slice(6))).toEqual(
      Array.from({ length: 60 }, (_, i) => `f${i}.ts`),
    );
  });
});

describe('isStale (AC-22)', () => {
  it('is stale only when a stored brief has a different head sha', () => {
    // Catches: a missing brief reported as stale, or a changed head not flagged.
    const brief = { head_sha: 'a' } as StoredBrief;
    expect(isStale(null, 'a')).toBe(false);
    expect(isStale(brief, 'a')).toBe(false);
    expect(isStale(brief, 'b')).toBe(true);
  });
});

describe('token fitting', () => {
  it('capTextToTokens leaves fitting text alone and cuts the rest with the marker inside the cap', () => {
    // Catches: the cap being exceeded by the marker itself (a cut block larger than its budget).
    expect(capTextToTokens('abcd', 1)).toBe('abcd');
    const out = capTextToTokens('x'.repeat(1000), 10);
    expect(out.endsWith(TRUNCATED_MARKER)).toBe(true);
    expect(estimateTokens(out)).toBeLessThanOrEqual(10);
  });

  it('fitLines keeps the longest prefix that fits together with the fixed lines', () => {
    // Catches: the always-kept totals line being forgotten in the budget, or a non-prefix selection.
    const lines = Array.from({ length: 10 }, () => 'x'.repeat(39)); // 40 chars with the newline = 10 tokens each
    const fixed = ['y'.repeat(39)];
    const { kept, droppedCount } = fitLines(lines, 35, fixed);
    expect(kept).toHaveLength(2); // 3 lines + fixed = 160 chars = 40 > 35 ; 2 lines + fixed = 119 chars = 30
    expect(droppedCount).toBe(8);
    expect(estimateTokens([...kept, ...fixed].join('\n'))).toBeLessThanOrEqual(35);
    expect(fitLines(lines, 1000).droppedCount).toBe(0);
    expect(fitLines(lines, 1, fixed).kept).toEqual([]);
  });
});

describe('PrBrief / StoredBrief contract (AC-6, F-3)', () => {
  const base = {
    intent: null,
    blast: null,
    risks: { risks: [] },
    history: { history: [] },
    summary: 'Adds rate limiting.',
    review_focus: [
      { file: 'src/config.ts', line: 12, reason: 'secret' },
      { file: 'src/api/users.ts', line: 45, reason: 'n+1' },
    ],
  };

  it('parses a brief with intent: null and blast: null', () => {
    // Catches: the contract requiring intent/blast, which would make "unavailable" facts unrepresentable (AC-4/5).
    const parsed = PrBrief.parse(base);
    expect(parsed.intent).toBeNull();
    expect(parsed.blast).toBeNull();
    expect(parsed.review_focus).toHaveLength(2);
  });

  it('rejects a focus item with line 0 or a non-integer line', () => {
    // Catches: an unanchored focus item (line 0) passing the stored contract.
    expect(PrBrief.safeParse({ ...base, review_focus: [{ file: 'a', line: 0, reason: 'r' }] }).success).toBe(false);
    expect(PrBrief.safeParse({ ...base, review_focus: [{ file: 'a', line: 1.5, reason: 'r' }] }).success).toBe(false);
  });

  it('StoredBrief adds the generation metadata and refuses a row without it', () => {
    // Catches: a legacy/corrupt row (PrBrief shape only) being served as a stored brief.
    const stored = {
      ...base,
      head_sha: 'abc',
      generated_at: '2026-10-12T00:00:00.000Z',
      provider: 'openai',
      model: 'gpt-4.1',
      tokens_in: null,
      tokens_out: null,
      cost_usd: null,
      spec_docs: [],
      truncated: false,
      files_total: 2,
      files_sent: 2,
    };
    expect(StoredBrief.safeParse(stored).success).toBe(true);
    expect(StoredBrief.safeParse(base).success).toBe(false);
  });
});
