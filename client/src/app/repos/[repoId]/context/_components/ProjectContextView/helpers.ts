import type { ContextFileInfo, ContextListing } from "@/lib/types";

/** Files sorted by path (plain code-unit order, same as the server). */
export function sortFiles(files: ContextFileInfo[]): ContextFileInfo[] {
  return files.slice().sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** The selected path if it still exists, otherwise the first file (default selection). */
export function resolveSelected(files: ContextFileInfo[], selected: string | null): string | null {
  if (selected && files.some((f) => f.path === selected)) return selected;
  return files[0]?.path ?? null;
}

/** What the list area shows: the not-cloned check wins over every index state. */
export type ListBodyState = "notCloned" | "notIndexed" | "empty" | "files";

export function listBodyState(listing: ContextListing): ListBodyState {
  if (!listing.cloned) return "notCloned";
  if (listing.files.length === 0) return listing.index.indexed_at === null ? "notIndexed" : "empty";
  return "files";
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
