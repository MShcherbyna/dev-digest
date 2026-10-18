/* ExportWizard — the four-step Export to CI modal: Target, Preview, Configure, Install
   (screenshots 1, 3, 5, 6). AccessibleModal supplies the focus trap, Esc and focus return
   (NFR-7); state and the preview/export calls live in useExportWizard. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, SelectInput } from "@devdigest/ui";
import type { Agent, CiInstallation, Repo } from "@devdigest/shared";
import { AccessibleModal } from "@/components/accessible-modal";
import { ConfigureStep } from "./_components/ConfigureStep";
import { InstallStep } from "./_components/InstallStep";
import { PreviewStep } from "./_components/PreviewStep";
import { TargetStep } from "./_components/TargetStep";
import { WizardStepper } from "./_components/WizardStepper";
import { MODAL_WIDTH, STEP_CONFIGURE, STEP_INSTALL, STEP_PREVIEW, WIZARD_STEPS } from "./constants";
import { availableRepos, zipFileName, type WizardMode } from "./helpers";
import { s } from "./styles";
import { useExportWizard } from "./use-export-wizard";

export function ExportWizard({
  agent,
  mode,
  installations,
  repos,
  activeRepo,
  initialInstallation,
  returnFocusTo,
  onClose,
}: {
  agent: Agent;
  mode: WizardMode;
  /** This agent's installations (for the repo filter and the update-mode select). */
  installations: CiInstallation[];
  /** Connected repositories. */
  repos: Repo[];
  activeRepo: Pick<Repo, "full_name"> | null;
  /** `update` mode: the installation to open for (first outdated one). */
  initialInstallation?: CiInstallation;
  returnFocusTo?: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const t = useTranslations("ci.exportWizard");
  const w = useExportWizard({ agent, mode, installations, activeRepo, initialInstallation });
  const { state } = w;
  const labels = WIZARD_STEPS.map((k) => t(`steps.${k}`));
  const done = w.installResult
    ? {
        mode: state.installMode,
        prUrl: w.installResult.pr_url,
        zipName: zipFileName(w.preview?.agent_slug ?? agent.name),
      }
    : null;

  return (
    <AccessibleModal
      width={MODAL_WIDTH}
      title={t("title")}
      subtitle={t("subtitle", { agentName: agent.name })}
      onClose={onClose}
      returnFocusTo={returnFocusTo}
      footer={
        <div style={s.footer}>
          {!done && state.step > w.minStep && (
            <Button kind="ghost" icon="ChevronLeft" onClick={w.back}>
              {t("back")}
            </Button>
          )}
          <div style={s.footerEnd}>
            {done ? (
              <Button kind="primary" onClick={onClose}>
                {t("close")}
              </Button>
            ) : state.step < STEP_INSTALL ? (
              <Button kind="primary" iconRight="ArrowRight" disabled={w.continueDisabled} onClick={w.next}>
                {t("continue")}
              </Button>
            ) : (
              <Button kind="primary" icon="Check" disabled={w.installDisabled} loading={w.installing} onClick={w.install}>
                {w.installing ? t("installing") : t("install")}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div style={s.stepper}>
        <WizardStepper step={state.step} labels={labels} ariaLabel={t("steps.label")} />
      </div>
      <div style={s.body}>
        {state.step === 0 && (
          <TargetStep
            target={state.target}
            onTarget={w.setTarget}
            repoSelect={
              mode === "add-repository"
                ? { options: availableRepos(repos, installations), value: state.repo, onChange: w.setRepo }
                : undefined
            }
          />
        )}
        {state.step === STEP_PREVIEW && (
          <>
            {mode === "update" && installations.length > 1 && (
              <div style={s.repoSelect}>
                <label>
                  <span style={s.repoLabel}>{t("repoLabel")}</span>
                  <SelectInput
                    value={installations.find((i) => i.repo === state.repo)?.id ?? ""}
                    onChange={w.selectInstallation}
                    options={installations.map((i) => ({ value: i.id, label: i.repo }))}
                  />
                </label>
              </div>
            )}
            <PreviewStep
              files={w.files}
              selectedPath={state.selectedPath}
              onSelect={w.selectFile}
              workflowText={w.workflowText}
              onEdit={w.editWorkflow}
              workflowError={w.workflowError}
              notes={w.preview?.notes ?? []}
              pending={w.previewPending}
              error={w.previewError}
              onRetry={w.retryPreview}
            />
          </>
        )}
        {state.step === STEP_CONFIGURE && (
          <ConfigureStep
            triggers={state.triggers}
            onToggleTrigger={(trigger) => w.changeConfig({ type: "toggleTrigger", trigger })}
            postAs={state.postAs}
            onPostAs={(postAs) => w.changeConfig({ type: "postAs", postAs })}
            secrets={w.preview?.secrets ?? null}
            secretsPending={w.previewPending}
            workflowEdited={w.edited}
          />
        )}
        {state.step === STEP_INSTALL && (
          <InstallStep
            repo={state.repo}
            fileCount={w.files.length}
            installMode={state.installMode}
            onInstallMode={w.setInstallMode}
            updating={mode === "update" || installations.some((i) => i.repo === state.repo)}
            block={w.installBlock}
            error={w.installError}
            onRetry={w.install}
            done={done}
          />
        )}
      </div>
    </AccessibleModal>
  );
}
