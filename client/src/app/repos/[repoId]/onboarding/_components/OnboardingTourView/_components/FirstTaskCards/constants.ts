import type { OnboardingComplexity } from "@/lib/hooks/onboarding";

export const COMPLEXITY_COLOR: Record<OnboardingComplexity, string> = {
  low: "var(--ok)",
  medium: "var(--warn)",
  high: "var(--crit)",
};
