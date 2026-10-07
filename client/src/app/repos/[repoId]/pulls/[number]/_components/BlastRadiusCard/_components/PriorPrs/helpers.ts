/** "2026-03-18T10:00:00Z" -> "2026-03-18"; '' when the value is not an ISO date. */
export function shortDate(iso: string): string {
  const m = /^\d{4}-\d{2}-\d{2}/.exec(iso);
  return m ? m[0] : "";
}
