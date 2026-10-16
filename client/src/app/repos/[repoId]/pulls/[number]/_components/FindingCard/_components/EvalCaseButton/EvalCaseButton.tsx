/* EvalCaseButton — "Turn into eval case" on a decided finding (screenshot 2).
   Disabled with a hint until the finding is accepted/dismissed, and once it
   already has a case ("In eval set"). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { notify } from "@/lib/toast";
import { useCreateCaseFromFinding, type EvalAwareFinding } from "@/lib/hooks/eval";
import { errorKey } from "./helpers";

export function EvalCaseButton({
  finding,
  prId,
  agentId,
}: {
  finding: EvalAwareFinding;
  prId: string;
  agentId?: string | null;
}) {
  const t = useTranslations("prReview");
  const create = useCreateCaseFromFinding(prId);
  const hintId = React.useId();
  const [created, setCreated] = React.useState(false);

  const decided = !!finding.accepted_at || !!finding.dismissed_at;
  const inSet = !!finding.eval_case_id || created;

  const onClick = () =>
    create.mutate(finding.id, {
      onSuccess: () => {
        setCreated(true);
        notify.success(
          t("finding.evalCase.created"),
          agentId ? { href: `/agents/${agentId}?tab=evals`, label: t("finding.evalCase.viewInEvals") } : undefined,
        );
      },
      onError: (e) => {
        // 409: the case already exists; the reviews refetch flips the button to "In eval set".
        if (e instanceof ApiError && e.status === 409) return setCreated(true);
        notify.error(t(`finding.evalCase.errors.${errorKey(e)}`));
      },
    });

  if (!decided && !inSet) {
    return (
      <>
        <Button
          kind="ghost"
          size="sm"
          icon="FlaskConical"
          disabled
          title={t("finding.evalCase.needsDecision")}
          aria-describedby={hintId}
        >
          {t("finding.evalCase.button")}
        </Button>
        <span id={hintId} hidden>
          {t("finding.evalCase.needsDecision")}
        </span>
      </>
    );
  }
  return (
    <Button
      kind={inSet ? "ghost" : "secondary"}
      size="sm"
      icon="FlaskConical"
      disabled={inSet}
      loading={create.isPending}
      onClick={onClick}
    >
      {inSet ? t("finding.evalCase.inSet") : t("finding.evalCase.button")}
    </Button>
  );
}
