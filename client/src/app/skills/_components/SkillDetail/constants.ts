import type { IconName } from "@devdigest/ui";

/** Route segment that means "create a new skill". */
export const NEW_SKILL_ID = "new";

/** Detail tab descriptor. `labelKey` resolves under the `skills` namespace. */
export interface DetailTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

export const TABS: readonly DetailTab[] = [
  { key: "config", labelKey: "detail.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "detail.tabs.preview", icon: "Eye" },
  { key: "evals", labelKey: "detail.tabs.evals", icon: "FlaskConical" },
  { key: "stats", labelKey: "detail.tabs.stats", icon: "BarChart" },
  { key: "versions", labelKey: "detail.tabs.versions", icon: "History" },
];
