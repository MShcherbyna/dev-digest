/** Locale date+time for a version timestamp; falls back to the raw string. */
export function formatVersionDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** The first version and the current one can't be restored (nothing to roll forward to). */
export function canRestore(version: number, currentVersion: number): boolean {
  return version !== 1 && version !== currentVersion;
}
