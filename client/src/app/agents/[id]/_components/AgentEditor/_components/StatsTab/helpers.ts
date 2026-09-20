/* Pure formatting helpers for the agent Stats tab. Null/undefined always
   renders as an em dash — nothing is fabricated when there is no data. */

const DASH = "—";

/** USD: 2 decimals ("$0.04"); sub-cent amounts keep 3 so they don't read as $0.00. */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return DASH;
  const abs = Math.abs(usd);
  return `$${abs > 0 && abs < 0.01 ? abs.toFixed(3) : abs.toFixed(2)}`;
}

/** Cost delta for the chip: "+$0.01" / "-$0.01"; null or zero -> null (chip hidden). */
export function formatCostDelta(delta: number | null | undefined): string | null {
  if (delta == null || delta === 0) return null;
  return `${delta > 0 ? "+" : "-"}${formatCost(delta)}`;
}

/** Compact token count: 950 -> "950", 16000 -> "16k", 1250 -> "1.3k", 2_500_000 -> "2.5M". */
export function formatTokens(tokens: number | null | undefined): string {
  if (tokens == null) return DASH;
  const compact = (n: number, unit: string) => `${Number(n.toFixed(1))}${unit}`;
  if (tokens >= 1_000_000) return compact(tokens / 1_000_000, "M");
  if (tokens >= 1_000) return compact(tokens / 1_000, "k");
  return String(tokens);
}

/** Duration: 850 -> "850ms", 6200 -> "6.2s", 65000 -> "1m 5s". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return DASH;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const totalSeconds = Math.round(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
}

/** ISO timestamp -> "2026-06-01 09:14" in the viewer's local time. */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Clamp a percentage to 0-100 for bar widths. */
export function clampPct(pct: number): number {
  return Math.min(100, Math.max(0, pct));
}
