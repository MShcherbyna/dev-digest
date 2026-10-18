/* RunReviewDropdown — trigger button ("Run Review") + the AgentPicker popover
   (S1, Q-7: full replacement of the old per-agent dropdown). 1 agent checked
   still calls the unchanged single-agent POST /pulls/:id/review (AC-8); 2+
   starts a multi-agent run and navigates to its results page (AC-9). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { useActiveRepo } from "@/lib/repo-context";
import { AgentPicker } from "../AgentPicker";

export function RunReviewDropdown({
  prId,
  size = "sm",
  kind = "primary",
  warnMerged = false,
  onRunStart,
  onRunsStarted,
  onRunSettled,
}: {
  prId: string;
  size?: "sm" | "md" | "lg";
  kind?: "primary" | "secondary";
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
  /** Fired the moment a run is kicked off (before it completes). */
  onRunStart?: () => void;
  onRunsStarted?: (runIds: string[]) => void;
  /** Fired when the run request settles (success or error). */
  onRunSettled?: () => void;
}) {
  const t = useTranslations("prReview");
  const { repoId } = useActiveRepo();

  return (
    <AgentPicker
      prId={prId}
      repoId={repoId}
      onRunStart={onRunStart}
      onRunsStarted={onRunsStarted}
      onRunSettled={onRunSettled}
      trigger={
        <span
          title={warnMerged ? t("runReview.mergedTooltip") : undefined}
          style={warnMerged ? { opacity: 0.6 } : undefined}
        >
          <Button kind={kind} size={size} iconRight="ChevronDown" icon="Sparkles">
            {t("runReview.runReview")}
          </Button>
        </span>
      }
    />
  );
}
