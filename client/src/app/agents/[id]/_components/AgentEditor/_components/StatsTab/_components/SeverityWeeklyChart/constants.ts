import { SEVERITY_COLORS } from "@/lib/chart-colors";

export const CHART_HEIGHT = 160;

/** Stack order, bottom to top. */
export const SEVERITY_SERIES = [
  { key: "CRITICAL", color: SEVERITY_COLORS.CRITICAL },
  { key: "WARNING", color: SEVERITY_COLORS.WARNING },
  { key: "SUGGESTION", color: SEVERITY_COLORS.SUGGESTION },
] as const;

export const TICK_STYLE = { fill: "var(--text-muted)", fontSize: 11 } as const;
