/* CiTab — an agent's CI deployment: installations, "Add to CI" / "Update CI config", the
   Fail CI on policy and recent CI runs (AC-1, 24, 26-29; screenshot 2). The tab pulls fresh
   CI results on open and every 60 s while visible (AC-21). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent, CiInstallation } from "@devdigest/shared";
import { CiRefreshBanner } from "@/components/ci-refresh-banner";
import { CiRunsTable } from "@/components/ci-runs-table";
import { useCiAutoRefresh, useCiInstallations, useCiRuns } from "@/lib/hooks/ci";
import { useActiveRepo } from "@/lib/repo-context";
import { ExportWizard, type WizardMode } from "./_components/ExportWizard";
import { FailCiOnSelect } from "./_components/FailCiOnSelect";
import { InstallationRow } from "./_components/InstallationRow";
import { RemoveInstallationDialog } from "./_components/RemoveInstallationDialog";
import { RECENT_RUNS_LIMIT } from "./constants";
import { activeCount, pickUpdateTarget } from "./helpers";
import { s } from "./styles";

interface WizardRequest {
  mode: WizardMode;
  installation?: CiInstallation;
}

export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci.ciTab");
  const installs = useCiInstallations(agent.id);
  const runs = useCiRuns({ agent: agent.id, limit: RECENT_RUNS_LIMIT });
  const refresh = useCiAutoRefresh(agent.id);
  const { repos, activeRepo } = useActiveRepo();
  const [wizard, setWizard] = React.useState<WizardRequest | null>(null);
  const [removing, setRemoving] = React.useState<CiInstallation | null>(null);
  // The modals open synchronously from a click; remember the trigger so closing returns focus to it.
  const trigger = React.useRef<HTMLElement | null>(null);

  const installations = installs.data ?? [];
  const openWizard = (request: WizardRequest, el?: HTMLElement) => {
    trigger.current = el ?? null;
    setWizard(request);
  };
  const closeWizard = React.useCallback(() => setWizard(null), []);
  const closeRemove = React.useCallback(() => setRemoving(null), []);

  const emptyState = (
    <div style={s.empty}>
      <EmptyState
        icon="Workflow"
        title={t("emptyTitle")}
        body={t("emptyBody")}
        cta={t("exportToCi")}
        onCta={() => openWizard({ mode: "add" })}
      />
    </div>
  );

  return (
    <div style={s.wrap}>
      {(refresh.error || refresh.hasPartialErrors) && (
        <div style={s.banner}>
          <CiRefreshBanner onRetry={refresh.refresh} retrying={refresh.isRefreshing} />
        </div>
      )}

      {installs.isLoading ? (
        <>
          <Skeleton height={44} style={{ marginBottom: 8 }} />
          <Skeleton height={44} />
        </>
      ) : installs.isError ? (
        <div style={s.loadError}>
          <span>{t("loadError")}</span>
          <Button kind="secondary" size="sm" icon="RefreshCw" onClick={() => void installs.refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : installations.length === 0 ? (
        emptyState
      ) : (
        <>
          <div style={s.header}>
            <h2 style={s.h2}>{t("deploymentHeading")}</h2>
            <Badge color="var(--ok)" bg="var(--ok-bg)" dot>
              {t("activeIn", { count: activeCount(installations) })}
            </Badge>
            <div style={s.headActions}>
              <Button
                kind="secondary"
                size="sm"
                icon="RefreshCw"
                onClick={(e) => openWizard({ mode: "update", installation: pickUpdateTarget(installations) }, e.currentTarget)}
              >
                {t("updateConfig")}
              </Button>
              <Button
                kind="primary"
                size="sm"
                icon="Plus"
                onClick={(e) => openWizard({ mode: "add" }, e.currentTarget)}
              >
                {t("addToCi")}
              </Button>
            </div>
          </div>

          <div role="list">
            {installations.map((i) => (
              <InstallationRow
                key={i.id}
                installation={i}
                agentName={agent.name}
                onRemove={(el) => {
                  trigger.current = el;
                  setRemoving(i);
                }}
              />
            ))}
          </div>
          <button
            type="button"
            style={s.addRow}
            onClick={(e) => openWizard({ mode: "add-repository" }, e.currentTarget)}
          >
            <Icon.Plus size={14} />
            {t("addRepository")}
          </button>

          <div style={s.failOn}>
            <FailCiOnSelect agent={agent} />
          </div>

          <section style={s.section} aria-labelledby={`recent-ci-runs-${agent.id}`}>
            <div style={s.sectionHead}>
              <h3 style={s.h3} id={`recent-ci-runs-${agent.id}`}>
                {t("recentRuns")}
              </h3>
              <Link href={`/ci-runs?agent=${encodeURIComponent(agent.id)}`} style={s.viewAll}>
                {t("viewAll")}
              </Link>
            </div>
            <CiRunsTable
              runs={runs.data?.slice(0, RECENT_RUNS_LIMIT)}
              isLoading={runs.isLoading}
              isError={runs.isError}
              onRetry={() => void runs.refetch()}
              empty={<p style={s.recentEmpty}>{t("recentEmpty")}</p>}
            />
          </section>
        </>
      )}

      {wizard && (
        <ExportWizard
          agent={agent}
          mode={wizard.mode}
          installations={installations}
          repos={repos ?? []}
          activeRepo={activeRepo ?? null}
          initialInstallation={wizard.installation}
          returnFocusTo={trigger}
          onClose={closeWizard}
        />
      )}
      {removing && (
        <RemoveInstallationDialog
          installation={removing}
          agentName={agent.name}
          returnFocusTo={trigger}
          onClose={closeRemove}
        />
      )}
    </div>
  );
}
