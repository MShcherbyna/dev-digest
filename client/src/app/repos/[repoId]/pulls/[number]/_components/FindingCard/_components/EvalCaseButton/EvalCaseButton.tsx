/* EvalCaseButton — "Turn into eval case" on a decided finding (screenshot 2).
   Disabled with a hint until the finding is accepted/dismissed, and once it
   already has a case ("In eval set"). Opens the eval case modal to preview
   the diff before persisting it, rather than creating a case straight away. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { notify } from "@/lib/toast";
import { useAgent } from "@/lib/hooks/agents";
import { useEvalCaseDraftFromFinding, type EvalAwareFinding } from "@/lib/hooks/eval";
import { EvalCaseModal } from "@/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/_components/EvalCaseModal";
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
  const hintId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [created, setCreated] = React.useState(false);

  const decided = !!finding.accepted_at || !!finding.dismissed_at;
  const inSet = !!finding.eval_case_id || created;

  const draft = useEvalCaseDraftFromFinding(open ? finding.id : null);
  const agent = useAgent(open ? agentId : null);
  const loading = open && (draft.isLoading || agent.isLoading);

  React.useEffect(() => {
    if (open && draft.isError) {
      notify.error(t(`finding.evalCase.errors.${errorKey(draft.error)}`));
      setOpen(false);
    } else if (open && agent.isError) {
      notify.error(t("finding.evalCase.errors.agent_missing"));
      setOpen(false);
    }
  }, [open, draft.isError, draft.error, agent.isError, t]);

  const onCreated = () => {
    setCreated(true);
    notify.success(
      t("finding.evalCase.created"),
      agentId ? { href: `/agents/${agentId}?tab=evals`, label: t("finding.evalCase.viewInEvals") } : undefined,
    );
  };

  if (!inSet && (!decided || !agentId)) {
    const hint = decided ? t("finding.evalCase.errors.agent_missing") : t("finding.evalCase.needsDecision");
    return (
      <>
        <Button kind="ghost" size="sm" icon="FlaskConical" disabled title={hint} aria-describedby={hintId}>
          {t("finding.evalCase.button")}
        </Button>
        <span id={hintId} hidden>
          {hint}
        </span>
      </>
    );
  }
  return (
    <>
      <Button
        kind={inSet ? "ghost" : "secondary"}
        size="sm"
        icon="FlaskConical"
        disabled={inSet}
        loading={loading}
        onClick={() => setOpen(true)}
      >
        {inSet ? t("finding.evalCase.inSet") : t("finding.evalCase.button")}
      </Button>
      {open && draft.data && agent.data && (
        <EvalCaseModal
          agent={agent.data}
          caseId={null}
          draft={draft.data}
          findingId={finding.id}
          prId={prId}
          onSaved={onCreated}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
