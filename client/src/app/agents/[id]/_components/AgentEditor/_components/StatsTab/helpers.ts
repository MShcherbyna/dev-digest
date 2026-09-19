/** Average cost per run, e.g. 0.0123 -> "$0.012"; null/undefined -> em dash. */
export function formatCost(usd: number | null | undefined): string {
  return usd == null ? "—" : `$${usd.toFixed(3)}`;
}
