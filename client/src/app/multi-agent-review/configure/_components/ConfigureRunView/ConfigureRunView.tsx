/* ConfigureRunView — /multi-agent-review/configure (S2/S3). Step 1 picks the
   PR; step 2 (disabled until a PR is chosen) picks 1-8 enabled agents; the run
   button follows the same routing as the PR-page picker (AC-8/AC-9). */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/repo-context";
import { useAgents } from "@/lib/hooks/agents";
import { usePrReviews, useRunReview } from "@/lib/hooks/reviews";
import {
  useAgentEstimates,
  useLastAgentSelection,
  useLatestPrMultiAgentRun,
  useStartMultiAgentRun,
} from "@/lib/hooks/multi-agent";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import {
  combineEstimates,
  defaultSelection,
  formatCombinedEstimate,
  MAX_AGENTS,
  agentEstimate,
} from "@/lib/multi-agent-estimate";
import type { PrMeta } from "@/lib/types";
import { PrStep } from "./_components/PrStep";
import { AgentCard } from "./_components/AgentCard";
import { agentCardSummary } from "./helpers";
import { s } from "./styles";

export function ConfigureRunView() {
  const t = useTranslations("runs");
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();
  const { repoId } = useActiveRepo();

  const [prId, setPrId] = React.useState<string | null>(search.get("pr"));
  const [pr, setPr] = React.useState<PrMeta | null>(null);

  const { data: agents } = useAgents();
  const enabled = (agents ?? []).filter((a) => a.enabled);
  const enabledIds = React.useMemo(() => enabled.map((a) => a.id), [enabled]);

  const { data: lastSelection } = useLastAgentSelection(repoId);
  const statsById = useAgentEstimates(enabledIds);
  const estimates = React.useMemo(() => {
    const out: Record<string, ReturnType<typeof agentEstimate>> = {};
    for (const id of enabledIds) out[id] = agentEstimate(statsById[id]);
    return out;
  }, [enabledIds, statsById]);

  const { data: reviews } = usePrReviews(prId);

  const [selected, setSelected] = React.useState<string[]>([]);
  const initialized = React.useRef(false);
  React.useEffect(() => {
    if (initialized.current) return;
    if (enabledIds.length === 0 && lastSelection === undefined) return;
    initialized.current = true;
    setSelected(defaultSelection(enabledIds, lastSelection?.agent_ids ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledIds.join(","), lastSelection]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_AGENTS) return prev;
      return [...prev, id];
    });
  };

  const selectAll = () => setSelected(enabledIds.slice(0, MAX_AGENTS));

  const runReview = useRunReview();
  const startMulti = useStartMultiAgentRun();
  const { data: latestMulti } = useLatestPrMultiAgentRun(prId ?? undefined);
  const [running, setRunning] = React.useState(false);

  const run = async () => {
    if (!prId || selected.length === 0) return;
    setRunning(true);
    try {
      if (selected.length === 1) {
        await runReview.mutateAsync({ prId, agentId: selected[0] });
        router.push(`/repos/${repoId}/pulls/${pr?.number}`);
        return;
      }
      try {
        const runRes = await startMulti.mutateAsync({ prId, agentIds: selected });
        router.push(`/multi-agent-review/${runRes.id}`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          toast.error("A multi-agent run is already in progress for this PR.");
          if (latestMulti) router.push(`/multi-agent-review/${latestMulti.id}`);
          return;
        }
        throw e;
      }
    } finally {
      setRunning(false);
    }
  };

  const combined = combineEstimates(selected.map((id) => estimates[id] ?? null));

  return (
    <AppShell crumb={[{ label: t("page.crumb"), href: "/multi-agent-review" }, { label: t("configure.crumb") }]}>
      <div style={s.page}>
        <h1 style={s.h1}>{t("configure.title")}</h1>
        <p style={s.subtitle}>{t("configure.subtitle")}</p>

        <div style={s.stepHeader}>
          <div style={s.stepBadge(false)}>1</div>
          <span style={s.stepTitle(false)}>{t("configure.step1")}</span>
        </div>
        <PrStep
          repoId={repoId}
          selectedPrId={prId}
          onSelect={(id, p) => {
            setPrId(id);
            setPr(p);
          }}
        />

        <div style={s.stepHeaderRow}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={s.stepBadge(!prId)}>2</div>
            <span style={s.stepTitle(!prId)}>{t("configure.step2")}</span>
          </div>
          {prId && enabled.length > 0 && (
            <button type="button" style={s.selectAll} onClick={selectAll}>
              {t("configure.selectAll")}
            </button>
          )}
        </div>

        {!prId ? (
          <div style={s.dashedBox}>
            <div style={s.dashedIcon}>
              <Icon.GitPullRequest size={18} />
            </div>
            <div style={s.dashedTitle}>{t("configure.pickPrFirstTitle")}</div>
            <div style={s.dashedBody}>{t("configure.pickPrFirstBody")}</div>
          </div>
        ) : (
          <div style={s.cardList}>
            {enabled.map((a) => (
              <AgentCard
                key={a.id}
                agent={a}
                checked={selected.includes(a.id)}
                disabled={!selected.includes(a.id) && selected.length >= MAX_AGENTS}
                estimate={estimates[a.id] ?? null}
                noEstimateLabel={t("configure.noEstimateYet")}
                summary={agentCardSummary(a, reviews)}
                onToggle={() => toggle(a.id)}
              />
            ))}
          </div>
        )}

        <div style={s.runRow}>
          <Button
            kind="primary"
            icon="Users"
            disabled={!prId || selected.length === 0}
            loading={running}
            onClick={run}
          >
            {t("configure.runButton", { count: selected.length })}
          </Button>
          {selected.length > 0 && (
            <span className="mono" style={s.combined}>
              {formatCombinedEstimate(combined)} · {t("configure.parallelFanOut")}
            </span>
          )}
        </div>
      </div>
    </AppShell>
  );
}
