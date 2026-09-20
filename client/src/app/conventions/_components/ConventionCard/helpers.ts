import { CONFIDENCE_WARN_BELOW } from "./constants";

export const confidencePct = (c: number): number => Math.round(Math.max(0, Math.min(1, c)) * 100);

export const confidenceColor = (c: number): string =>
  c < CONFIDENCE_WARN_BELOW ? "var(--warn)" : "var(--text-muted)";
