import type { IntentConfidence, PrIntent } from "@/lib/hooks/intent";
import { RISK_FALLBACK, RISK_KINDS } from "./constants";

export type IntentCardState = "loading" | "generating" | "empty" | "error" | "ready" | "stale";

/** Card state, derived during render from the query + mutation flags. */
export function cardState(args: {
  loading: boolean;
  generating: boolean;
  intent: PrIntent | null;
  failed: boolean;
}): IntentCardState {
  if (args.loading) return "loading";
  if (args.generating) return "generating";
  if (args.intent) return args.intent.stale ? "stale" : "ready";
  return args.failed ? "error" : "empty";
}

export function riskLook(label: string) {
  return RISK_KINDS.find((k) => k.test.test(label)) ?? RISK_FALLBACK;
}

/** Tag colour per confidence: only the low tier is tinted. */
export function confidenceColor(c: IntentConfidence): string {
  return c === "low" ? "var(--warn)" : "var(--text-muted)";
}
