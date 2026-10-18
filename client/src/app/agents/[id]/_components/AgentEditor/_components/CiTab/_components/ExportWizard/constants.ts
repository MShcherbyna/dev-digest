import type { CiPostAs, CiSecretStatus, CiTarget, CiTrigger } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Wizard steps in order; labels resolve under `ci.exportWizard.steps`. */
export const WIZARD_STEPS = ["target", "preview", "configure", "install"] as const;
export const STEP_PREVIEW = 1;
export const STEP_CONFIGURE = 2;
export const STEP_INSTALL = 3;

export const MODAL_WIDTH = 840;

/** The only target with a generator; the others are "Coming soon" stubs (AC-3). */
export const IMPLEMENTED_TARGET: CiTarget = "gha";

export interface TargetCard {
  key: CiTarget;
  icon: IconName;
  recommended?: boolean;
}

/** Target cards (screenshot 1). */
export const TARGETS: readonly TargetCard[] = [
  { key: "gha", icon: "Workflow", recommended: true },
  { key: "circle", icon: "RefreshCw" },
  { key: "jenkins", icon: "Settings" },
  { key: "cli", icon: "Command" },
];

/** Trigger chips, in the order the workflow lists them (AC-10). */
export const TRIGGER_ORDER: readonly CiTrigger[] = ["opened", "synchronize", "reopened"];
export const DEFAULT_TRIGGERS: readonly CiTrigger[] = ["opened", "synchronize"];

export const DEFAULT_POST_AS: CiPostAs = "github_review";

/** "Post results as" radios (AC-12); `key` resolves under `ci.exportWizard.postAs`. */
export const POST_AS_OPTIONS: readonly { value: CiPostAs; key: string; recommended?: boolean }[] = [
  { value: "github_review", key: "githubReview", recommended: true },
  { value: "pr_comment", key: "prComment" },
  { value: "none", key: "none" },
];

/** Secret status → badge colours (the badge always carries text). */
export const SECRET_STYLE: Record<CiSecretStatus, { color: string; bg: string }> = {
  ready: { color: "var(--ok)", bg: "var(--ok-bg)" },
  not_set: { color: "var(--warn)", bg: "var(--warn-bg)" },
  unknown: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
};

/** Decision D-5: the "GitHub Action setup docs" link. */
export const GITHUB_DOCS_URL =
  "https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions";

/** Manifest files live here; the workflow is the only editable file (AC-4). */
export const MANIFEST_PREFIX = ".devdigest/agents/";

/** Install blockers the preview (or a 409) can report (AC-31, AC-32). */
export const INSTALL_BLOCK_CODES: ReadonlySet<string> = new Set(["multi_agent_unsupported", "agent_slug_conflict"]);
