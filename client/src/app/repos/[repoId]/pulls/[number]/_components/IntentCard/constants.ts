import type { IconName } from "@devdigest/ui";

/** Risk chip look: keyword → icon + tint (matches the design's shield / dependency / generic chips). */
export const RISK_KINDS: { test: RegExp; icon: IconName; color: string }[] = [
  { test: /auth|secret|security|permission|token|credential|injection|xss|csrf/i, icon: "Shield", color: "var(--crit)" },
  { test: /dependenc|package|library|upgrade|version|vendor/i, icon: "Boxes", color: "var(--warn)" },
];

export const RISK_FALLBACK: { icon: IconName; color: string } = { icon: "Zap", color: "var(--text-muted)" };
