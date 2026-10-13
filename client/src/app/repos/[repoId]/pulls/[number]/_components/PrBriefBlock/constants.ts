import type { IconName } from "@devdigest/ui";
import type { RiskSeverity } from "@devdigest/shared";

/** Risk-card icon + tint per (server-normalised) kind; anything else → `DEFAULT_KIND_LOOK`. */
export const KIND_LOOK: Record<string, { icon: IconName; color: string }> = {
  security: { icon: "Shield", color: "var(--crit)" },
  dependency: { icon: "Boxes", color: "var(--warn)" },
  performance: { icon: "Zap", color: "var(--text-muted)" },
};

export const DEFAULT_KIND_LOOK: { icon: IconName; color: string } = {
  icon: "AlertTriangle",
  color: "var(--text-muted)",
};

/** Severity text tint in the expanded risk body. */
export const SEVERITY_COLOR: Record<RiskSeverity, string> = {
  high: "var(--crit)",
  medium: "var(--warn)",
  low: "var(--text-muted)",
};

/** Opacity of the brief content while a regeneration runs. */
export const REGENERATING_OPACITY = 0.6;
