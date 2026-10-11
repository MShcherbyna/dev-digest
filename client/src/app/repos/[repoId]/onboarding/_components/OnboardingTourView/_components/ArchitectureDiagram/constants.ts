import type { OnboardingNodeKind } from "@/lib/hooks/onboarding";

/** Node stroke colour per kind (AC-16): external gray, entry/service blue, middleware amber, storage green. */
export const KIND_COLOR: Record<OnboardingNodeKind, string> = {
  external: "var(--border-strong)",
  entry: "var(--accent)",
  service: "var(--accent)",
  middleware: "var(--warn)",
  storage: "var(--ok)",
};

export const LABEL_MAX_CHARS = 24;
export const NODE_HEIGHT = 30;
export const NODE_MIN_WIDTH = 64;
export const NODE_PAD_X = 16;
export const CHAR_WIDTH = 7.6;
export const COLUMN_GAP = 64;
export const ROW_GAP = 22;
export const PAD = 28;
