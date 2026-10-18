/* useExportWizard — the wizard's state and its two server calls.
   State is a reducer (helpers.ts). Server data is never copied into state: the preview is
   the preview mutation's data, and only the user's own workflow edit is held locally.
   The preview is fired from events (Continue from Target, a Configure change) and once on
   mount when the wizard opens at Preview (update mode). */
"use client";

import React from "react";
import type { Agent, CiExportInputBody, CiInstallation, Repo } from "@devdigest/shared";
import { useCiPreview, useExportCi } from "@/lib/hooks/ci";
import { ciErrorCode } from "../../ci-errors";
import { IMPLEMENTED_TARGET, INSTALL_BLOCK_CODES, STEP_CONFIGURE, STEP_INSTALL, STEP_PREVIEW } from "./constants";
import {
  applyWorkflowEdit,
  buildZip,
  downloadBytes,
  initialWizardState,
  isWorkflowEdited,
  workflowParseError,
  wizardReducer,
  zipFileName,
  type WizardAction,
  type WizardMode,
  type WizardState,
  type WizardStep,
} from "./helpers";

export interface ExportWizardInput {
  agent: Agent;
  mode: WizardMode;
  installations: CiInstallation[];
  activeRepo: Pick<Repo, "full_name"> | null;
  /** `update` mode: the installation the wizard opens for. */
  initialInstallation?: CiInstallation;
}

type PreviewParams = Pick<WizardState, "repo" | "target" | "triggers" | "postAs">;

export function useExportWizard({ agent, mode, installations, activeRepo, initialInstallation }: ExportWizardInput) {
  const [state, dispatch] = React.useReducer(wizardReducer, undefined, () =>
    initialWizardState({ mode, activeRepo, installation: initialInstallation }),
  );
  const previewMutation = useCiPreview(agent.id);
  const exportMutation = useExportCi(agent.id);
  const minStep: WizardStep = mode === "update" ? STEP_PREVIEW : 0;

  const runPreview = (p: PreviewParams) => {
    if (!p.repo || p.triggers.length === 0) return;
    previewMutation.mutate({ repo: p.repo, target: p.target, triggers: p.triggers, post_as: p.postAs });
  };

  // Update mode opens straight at Preview, so the first preview is requested on mount.
  const bootstrapped = React.useRef(false);
  React.useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    if (state.step === STEP_PREVIEW) runPreview(state);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const preview = previewMutation.data ?? null;
  const generatedWorkflow = preview?.files.find((f) => f.editable)?.contents;
  const edited = isWorkflowEdited(state.editedWorkflow, generatedWorkflow);
  const files = preview ? applyWorkflowEdit(preview.files, state.editedWorkflow) : [];
  const workflowText = state.editedWorkflow ?? generatedWorkflow ?? "";
  const workflowError = preview ? workflowParseError(workflowText) : null;

  const exportCode = ciErrorCode(exportMutation.error);
  const installBlock =
    preview?.install_block ?? (exportCode && INSTALL_BLOCK_CODES.has(exportCode) ? exportCode : null);

  /** Trigger / post-as change: regenerate the workflow unless the user edited it (AC-9). */
  const changeConfig = (action: Extract<WizardAction, { type: "toggleTrigger" | "postAs" }>) => {
    const next = wizardReducer(state, action);
    dispatch(action);
    if (edited) return;
    if (state.editedWorkflow !== null) dispatch({ type: "editWorkflow", text: null });
    runPreview(next);
  };

  const next = () => {
    if (state.step === 0) runPreview(state);
    dispatch({ type: "step", step: Math.min(state.step + 1, STEP_INSTALL) as WizardStep });
  };
  const back = () => dispatch({ type: "step", step: Math.max(state.step - 1, minStep) as WizardStep });

  const selectInstallation = (installationId: string) => {
    const installation = installations.find((i) => i.id === installationId);
    if (!installation) return;
    const action: WizardAction = { type: "useInstallation", installation };
    dispatch(action);
    runPreview(wizardReducer(state, action));
  };

  const install = () => {
    if (!preview) return;
    const body: CiExportInputBody = {
      repo: state.repo,
      target: state.target,
      post_as: state.postAs,
      triggers: state.triggers,
      mode: state.installMode,
      // Only a manual edit travels; otherwise the server uses (and merges) its own generation.
      ...(edited && state.editedWorkflow !== null ? { workflow: state.editedWorkflow } : {}),
    };
    exportMutation.mutate(body, {
      onSuccess: () => {
        if (state.installMode === "manual") downloadBytes(zipFileName(preview.agent_slug), buildZip(files));
      },
    });
  };

  const continueDisabled =
    state.step === 0
      ? !state.repo || state.target !== IMPLEMENTED_TARGET
      : state.step === STEP_PREVIEW
        ? previewMutation.isPending || !preview || workflowError !== null
        : state.step === STEP_CONFIGURE
          ? state.triggers.length === 0 || previewMutation.isPending || !preview
          : false;

  return {
    state,
    minStep,
    preview,
    previewPending: previewMutation.isPending,
    previewError: previewMutation.error,
    retryPreview: () => {
      if (previewMutation.variables) previewMutation.mutate(previewMutation.variables);
    },
    files,
    workflowText,
    workflowError,
    edited,
    installBlock,
    installing: exportMutation.isPending,
    installError: exportMutation.isError ? exportMutation.error : null,
    installResult: exportMutation.data ?? null,
    continueDisabled,
    installDisabled: exportMutation.isPending || !preview || installBlock !== null,
    next,
    back,
    install,
    changeConfig,
    selectInstallation,
    setRepo: (repo: string) => dispatch({ type: "repo", repo }),
    setTarget: (target: WizardState["target"]) => dispatch({ type: "target", target }),
    setInstallMode: (m: WizardState["installMode"]) => dispatch({ type: "installMode", mode: m }),
    editWorkflow: (text: string) => dispatch({ type: "editWorkflow", text }),
    selectFile: (path: string) => dispatch({ type: "selectFile", path }),
  };
}
