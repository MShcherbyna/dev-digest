import type { ContextDocType, ContextFileInfo } from "@/lib/types";

export type RowStatus = "ok" | "too_large" | "not_found";

export interface DocRow {
  path: string;
  attached: boolean;
  status: RowStatus;
  type?: ContextDocType;
  tokens: number;
}

/** Split a repo-relative path into file name and (secondary) directory with trailing slash. */
export function splitPath(path: string): { name: string; dir: string } {
  const i = path.lastIndexOf("/");
  return i === -1 ? { name: path, dir: "" } : { name: path.slice(i + 1), dir: path.slice(0, i + 1) };
}

/**
 * Attached rows first (in attachment order), then the remaining discovered
 * files by path. An attached path missing from a known discovery is a
 * `not_found` row; with no discovery (`files` undefined) existence is unknown.
 */
export function buildRows(attached: string[], files: ContextFileInfo[] | undefined): DocRow[] {
  const byPath = new Map((files ?? []).map((f) => [f.path, f]));
  const rowFor = (path: string, isAttached: boolean): DocRow => {
    const f = byPath.get(path);
    if (!f) return { path, attached: isAttached, status: files ? "not_found" : "ok", tokens: 0 };
    return { path, attached: isAttached, status: f.too_large ? "too_large" : "ok", type: f.type, tokens: f.tokens };
  };
  const attachedSet = new Set(attached);
  const rest = (files ?? [])
    .filter((f) => !attachedSet.has(f.path))
    .map((f) => f.path)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return [...attached.map((p) => rowFor(p, true)), ...rest.map((p) => rowFor(p, false))];
}

/** Check appends to the end of the attached list; uncheck removes it. */
export function toggle(attached: string[], path: string): string[] {
  return attached.includes(path) ? attached.filter((p) => p !== path) : [...attached, path];
}

/** Move `from` to the slot of `to` (both attached paths). Returns the same array when nothing changes. */
export function move(attached: string[], from: string, to: string): string[] {
  const a = attached.indexOf(from);
  const b = attached.indexOf(to);
  if (a === -1 || b === -1 || a === b) return attached;
  const next = attached.slice();
  next.splice(a, 1);
  next.splice(b, 0, from);
  return next;
}

/** Sum of tokens of attached rows that exist and are not too large. */
export function tokenTotal(rows: DocRow[]): number {
  return rows.reduce((sum, r) => (r.attached && r.status === "ok" ? sum + r.tokens : sum), 0);
}

/** Case-insensitive substring filter over the path. */
export function filterRows(rows: DocRow[], query: string): DocRow[] {
  const q = query.trim().toLowerCase();
  return q ? rows.filter((r) => r.path.toLowerCase().includes(q)) : rows;
}
