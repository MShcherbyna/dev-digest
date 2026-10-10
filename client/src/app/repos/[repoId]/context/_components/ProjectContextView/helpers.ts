import type { ContextFileInfo } from "@/lib/types";

/** Files sorted by path (plain code-unit order, same as the server). */
export function sortFiles(files: ContextFileInfo[]): ContextFileInfo[] {
  return files.slice().sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** The selected path if it still exists, otherwise the first file (default selection). */
export function resolveSelected(files: ContextFileInfo[], selected: string | null): string | null {
  if (selected && files.some((f) => f.path === selected)) return selected;
  return files[0]?.path ?? null;
}

/** Locale-aware "5m ago" style label; falls back to the raw string for an unparsable date. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const sec = Math.round((then - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const abs = Math.abs(sec);
  if (abs < 60) return rtf.format(sec, "second");
  if (abs < 3600) return rtf.format(Math.round(sec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(sec / 3600), "hour");
  return rtf.format(Math.round(sec / 86400), "day");
}

/** File name of a repo-relative path. */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Directory of a repo-relative path with a trailing slash ("" for a file at the repo root). */
export function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i + 1);
}

/** Area label for the row badge: the top-level folder, or "root" for a file at the repo root. */
export function areaOf(path: string): string {
  const i = path.indexOf("/");
  return i === -1 ? "root" : path.slice(0, i);
}
