/* skill-format.ts — small pure helpers/constants shared by the Skills Lab and
   the Agent editor's Skills tab (2+ features, so they live in lib/). */
import type { SkillType } from "@devdigest/shared";

/** Selectable skill types, in display order. */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Badge colour per skill type (CSS tokens only). */
export const SKILL_TYPE_COLOR: Record<SkillType, string> = {
  rubric: "var(--accent)",
  convention: "var(--ok)",
  security: "var(--crit)",
  custom: "var(--text-secondary)",
};

/** Tinted badge background per skill type. */
export const SKILL_TYPE_BG: Record<SkillType, string> = {
  rubric: "var(--accent-bg)",
  convention: "var(--ok-bg)",
  security: "var(--crit-bg)",
  custom: "var(--bg-hover)",
};

/** Rough token estimate: ceil(chars / 4) — same rule as the server. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Percent for display; null/undefined -> em dash (never fabricate a number). */
export function formatPct(pct: number | null | undefined): string {
  return pct == null ? "—" : `${Math.round(pct)}%`;
}
