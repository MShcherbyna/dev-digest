/** Locale date+time for a version timestamp; falls back to the raw string. */
export function formatVersionDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
