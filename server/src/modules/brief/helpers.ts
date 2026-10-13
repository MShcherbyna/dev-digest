import { estimateTokens } from '@devdigest/reviewer-core';
import type { BlastRadius, Risk, SmartDiffRole } from '@devdigest/shared';
import {
  BRIEF_ROLE_ORDER,
  MAX_FILES_SENT,
  MAX_FOCUS_ITEMS,
  MAX_RISKS,
  RISK_KINDS,
  TRUNCATED_MARKER,
} from './constants.js';
import type { BriefFile, RoleOf } from './ports.js';
import type { StoredBrief } from './schemas.js';

export type Range = readonly [start: number, end: number];

/** A changed file with its role and ALL head-side hunk ranges (grounding uses all of them). */
export interface PreparedFile {
  path: string;
  additions: number;
  deletions: number;
  role: SmartDiffRole;
  ranges: Range[];
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/** Head-side `[start, end]` ranges from `@@ -a,b +c,d @@`. `d` defaults to 1; `d = 0` gives none. */
export function hunkRanges(patch: string | null): Range[] {
  if (!patch) return [];
  const out: Range[] = [];
  for (const line of patch.split('\n')) {
    const m = HUNK_HEADER.exec(line);
    if (!m) continue;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (count > 0) out.push([start, start + count - 1]);
  }
  return out;
}

/** Sorts by `BRIEF_ROLE_ORDER` (stable within a role), keeps the first `MAX_FILES_SENT` (AC-30). */
export function selectFiles(
  files: BriefFile[],
  roleOf: RoleOf,
): { selected: PreparedFile[]; total: number } {
  const rank = (r: SmartDiffRole): number => BRIEF_ROLE_ORDER.indexOf(r);
  const prepared = files.map<PreparedFile>((f) => ({
    path: f.path,
    additions: f.additions,
    deletions: f.deletions,
    role: roleOf(f.path),
    ranges: hunkRanges(f.patch),
  }));
  const sorted = prepared
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rank(a.f.role) - rank(b.f.role) || a.i - b.i)
    .map((x) => x.f);
  return { selected: sorted.slice(0, MAX_FILES_SENT), total: files.length };
}

/** `file -> caller lines` from the blast block; empty when blast is null (AC-8, AC-37). */
export function blastCallerLines(blast: BlastRadius | null): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  if (!blast) return out;
  for (const d of blast.downstream) {
    for (const c of d.callers) {
      const set = out.get(c.file) ?? new Set<number>();
      set.add(c.line);
      out.set(c.file, set);
    }
  }
  return out;
}

export interface FileRef {
  path: string;
  start?: number;
  end?: number;
}

/** `path`, `path:N` or `path:N-M`. A bad range (N > M, N < 1) or a non-numeric suffix falls back to path only. */
export function parseFileRef(ref: string): FileRef | null {
  const text = ref.trim();
  if (text === '') return null;
  const m = /^(.+?):(\d+)(?:-(\d+))?$/.exec(text);
  if (m) {
    const start = Number(m[2]);
    const end = m[3] === undefined ? start : Number(m[3]);
    if (start < 1 || start > end) return { path: m[1]! };
    return { path: m[1]!, start, end };
  }
  const tail = /^(.+?):([^/:]*)$/.exec(text);
  if (tail) return { path: tail[1]! };
  return { path: text };
}

const inAny = (ranges: readonly Range[], line: number): boolean =>
  ranges.some(([s, e]) => line >= s && line <= e);

export interface FocusItem {
  file: string;
  line: number;
  reason: string;
}

/**
 * Keeps focus items anchored on a real place: a changed file's head-side hunk,
 * or (blast-only file) a listed caller line. First 5 survivors, model order.
 */
export function groundFocus(
  items: FocusItem[],
  changed: Map<string, Range[]>,
  callers: Map<string, Set<number>>,
): { kept: FocusItem[]; dropped: number } {
  const survivors = items.filter((it) => {
    if (!Number.isInteger(it.line) || it.line < 1) return false;
    const ranges = changed.get(it.file);
    if (ranges) return inAny(ranges, it.line);
    return callers.get(it.file)?.has(it.line) ?? false;
  });
  const kept = survivors.slice(0, MAX_FOCUS_ITEMS);
  return { kept, dropped: items.length - kept.length };
}

export function normalizeKind(kind: string): string {
  const k = kind.trim().toLowerCase();
  return (RISK_KINDS as readonly string[]).includes(k) ? k : 'other';
}

function reduceRef(
  ref: FileRef,
  changed: Map<string, Range[]>,
  callers: Map<string, Set<number>>,
): string | null {
  const ranges = changed.get(ref.path);
  const callerLines = callers.get(ref.path);
  if (!ranges && !callerLines) return null;
  if (ref.start === undefined || ref.end === undefined) return ref.path;
  const { start, end } = ref;
  const text = start === end ? `${ref.path}:${start}` : `${ref.path}:${start}-${end}`;
  if (ranges) {
    return ranges.some(([s, e]) => start >= s && end <= e) ? text : ref.path;
  }
  return start === end && callerLines!.has(start) ? text : ref.path;
}

/** Drops unknown-file refs (AC-37), reduces unprovable lines to the path (AC-19), caps at 5 risks. */
export function groundRisks(
  risks: Risk[],
  changed: Map<string, Range[]>,
  callers: Map<string, Set<number>>,
): { kept: Risk[]; droppedRefs: number; droppedRisks: number } {
  let droppedRefs = 0;
  const kept: Risk[] = [];
  for (const r of risks) {
    const refs: string[] = [];
    for (const raw of r.file_refs) {
      const parsed = parseFileRef(raw);
      const reduced = parsed ? reduceRef(parsed, changed, callers) : null;
      if (reduced === null) droppedRefs++;
      else if (!refs.includes(reduced)) refs.push(reduced);
    }
    if (refs.length > 0) kept.push({ ...r, kind: normalizeKind(r.kind), file_refs: refs });
  }
  const capped = kept.slice(0, MAX_RISKS);
  return { kept: capped, droppedRefs, droppedRisks: risks.length - capped.length };
}

/** AC-22: stale = a stored brief whose head SHA differs from the PR's. */
export function isStale(brief: StoredBrief | null, headSha: string): boolean {
  return brief !== null && brief.head_sha !== headSha;
}

/** Cuts `text` at the end to fit `maxTokens`, appending the truncation marker. */
export function capTextToTokens(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text;
  const room = Math.max(0, maxTokens * 4 - TRUNCATED_MARKER.length);
  return text.slice(0, room) + TRUNCATED_MARKER;
}

/**
 * Keeps the longest prefix of `lines` which, joined with the always-kept
 * `fixedLines` by newlines, fits `maxTokens`.
 */
export function fitLines(
  lines: string[],
  maxTokens: number,
  fixedLines: string[] = [],
): { kept: string[]; droppedCount: number } {
  let count = lines.length;
  while (count > 0 && estimateTokens([...lines.slice(0, count), ...fixedLines].join('\n')) > maxTokens) {
    count--;
  }
  return { kept: lines.slice(0, count), droppedCount: lines.length - count };
}
