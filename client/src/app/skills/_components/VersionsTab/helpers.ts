/** Locale date+time for a version timestamp; falls back to the raw string. */
export function formatVersionDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** Restore copies the previous version's text, so v1 (nothing before it) can't be restored. */
export function canRestore(version: number): boolean {
  return version > 1;
}
