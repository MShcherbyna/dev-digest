/* EvalsTab — agent eval metrics + eval cases list (screenshot 6). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Agent } from "@devdigest/shared";
import { Button, EmptyState, ErrorState, SectionLabel, Skeleton } from "@devdigest/ui";
import { ConfirmDeleteModal } from "@/components/confirm-delete-modal";
import { notify } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { useAgentEvalRuns, useDeleteEvalCase, useEvalCases, useRunEvalCase } from "@/lib/hooks/eval";
import { EvalCaseModal } from "./_components/EvalCaseModal";
import { EvalCaseRow } from "./_components/EvalCaseRow";
import { EvalMetricCards } from "./_components/EvalMetricCards";
import { RunAllEvalsButton } from "./_components/RunAllEvalsButton";
import { passingBadge } from "./helpers";
import { s } from "./styles";

/** `null` = closed, "new" = create, otherwise the id of the case being edited. */
type ModalState = null | "new" | { id: string };

export function EvalsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("eval.evalsTab");
  const cases = useEvalCases(agent.id);
  const runs = useAgentEvalRuns(agent.id);
  const runCase = useRunEvalCase(agent.id);
  const del = useDeleteEvalCase(agent.id);
  const [modal, setModal] = React.useState<ModalState>(null);
  const [toDelete, setToDelete] = React.useState<{ id: string; name: string } | null>(null);

  const list = cases.data ?? [];
  const badge = passingBadge(list);

  const onRun = (id: string) =>
    runCase.mutate(id, {
      onError: (e) => {
        const code = e instanceof ApiError ? e.code : undefined;
        notify.error(code && t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic"));
      },
    });

  return (
    <div style={s.wrap}>
      <div>
        <div style={s.metricsHead}>
          <SectionLabel icon="Gauge">{t("metricsTitle")}</SectionLabel>
          <Link href={`/eval/${agent.id}`} style={s.dashLink}>
            {t("viewDashboard")}
          </Link>
        </div>
        <EvalMetricCards runs={runs.data} />
      </div>

      <div style={s.casesHead}>
        <h3 style={s.casesTitle}>{t("casesHeading")}</h3>
        {list.length > 0 && <span style={s.badge}>{t("passing", badge)}</span>}
        <div style={s.headActions}>
          <RunAllEvalsButton agentId={agent.id} provider={agent.provider} runs={runs.data} disabled={list.length === 0} />
          <Button kind="primary" icon="Plus" onClick={() => setModal("new")}>
            {t("newCase")}
          </Button>
        </div>
      </div>

      {cases.isLoading ? (
        <Skeleton height={120} />
      ) : cases.isError ? (
        <ErrorState title={t("loadError")} onRetry={() => void cases.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState icon="FlaskConical" title={t("emptyCases")} />
      ) : (
        <div style={s.list}>
          {list.map((c) => (
            <EvalCaseRow
              key={c.id}
              c={c}
              onRun={() => onRun(c.id)}
              onEdit={() => setModal({ id: c.id })}
              onDelete={() => setToDelete({ id: c.id, name: c.name })}
            />
          ))}
        </div>
      )}

      {modal && (
        <EvalCaseModal agent={agent} caseId={modal === "new" ? null : modal.id} onClose={() => setModal(null)} />
      )}
      {toDelete && (
        <ConfirmDeleteModal
          title={t("deleteTitle")}
          message={t("deleteMessage", { name: toDelete.name })}
          pending={del.isPending}
          onConfirm={() => del.mutate(toDelete.id, { onSettled: () => setToDelete(null) })}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
