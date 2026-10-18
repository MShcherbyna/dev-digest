/* helpers.ts — the wizard's pure logic: reducer, initial state, workflow YAML check, zip. */
import { parseDocument } from "yaml";
import { strToU8, zipSync } from "fflate";
import type {
  CiFile,
  CiInstallation,
  CiInstallMode,
  CiPostAs,
  CiTarget,
  CiTrigger,
  Repo,
} from "@devdigest/shared";
import { DEFAULT_POST_AS, DEFAULT_TRIGGERS, TRIGGER_ORDER } from "./constants";

/** `add`: the active repo · `add-repository`: pick a repo without this agent · `update`: opens at Preview (AC-2, AC-28). */
export type WizardMode = "add" | "add-repository" | "update";
export type WizardStep = 0 | 1 | 2 | 3;

export interface WizardState {
  step: WizardStep;
  /** "owner/name"; empty until chosen in `add-repository` mode. */
  repo: string;
  target: CiTarget;
  triggers: CiTrigger[];
  postAs: CiPostAs;
  installMode: CiInstallMode;
  /** The user's text for the workflow, or `null` while untouched. */
  editedWorkflow: string | null;
  selectedPath: string | null;
}

export type WizardAction =
  | { type: "step"; step: WizardStep }
  | { type: "repo"; repo: string }
  | { type: "target"; target: CiTarget }
  | { type: "toggleTrigger"; trigger: CiTrigger }
  | { type: "postAs"; postAs: CiPostAs }
  | { type: "installMode"; mode: CiInstallMode }
  | { type: "editWorkflow"; text: string | null }
  | { type: "selectFile"; path: string }
  | { type: "useInstallation"; installation: CiInstallation };

export function initialWizardState({
  mode,
  activeRepo,
  installation,
}: {
  mode: WizardMode;
  activeRepo: Pick<Repo, "full_name"> | null;
  installation?: CiInstallation;
}): WizardState {
  const base: WizardState = {
    step: 0,
    repo: mode === "add" ? (activeRepo?.full_name ?? "") : "",
    target: "gha",
    triggers: [...DEFAULT_TRIGGERS],
    postAs: DEFAULT_POST_AS,
    installMode: "pr",
    editedWorkflow: null,
    selectedPath: null,
  };
  if (mode === "update" && installation) return wizardReducer(base, { type: "useInstallation", installation });
  return base;
}

function sortTriggers(triggers: readonly CiTrigger[]): CiTrigger[] {
  return TRIGGER_ORDER.filter((t) => triggers.includes(t));
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "step":
      return { ...state, step: action.step };
    case "repo":
      // A different repo has a different existing workflow: drop the edit and the file choice.
      return action.repo === state.repo ? state : { ...state, repo: action.repo, editedWorkflow: null, selectedPath: null };
    case "target":
      return { ...state, target: action.target };
    case "toggleTrigger": {
      const on = state.triggers.includes(action.trigger);
      const next = on ? state.triggers.filter((t) => t !== action.trigger) : [...state.triggers, action.trigger];
      return { ...state, triggers: sortTriggers(next) };
    }
    case "postAs":
      return { ...state, postAs: action.postAs };
    case "installMode":
      return { ...state, installMode: action.mode };
    case "editWorkflow":
      return { ...state, editedWorkflow: action.text };
    case "selectFile":
      return { ...state, selectedPath: action.path };
    case "useInstallation": {
      const i = action.installation;
      return {
        ...state,
        step: 1,
        repo: i.repo,
        triggers: sortTriggers(i.triggers),
        postAs: i.post_as,
        installMode: i.mode,
        editedWorkflow: null,
        selectedPath: null,
      };
    }
  }
}

/** Connected repos where this agent has no installation yet (AC-2). */
export function availableRepos(repos: readonly Repo[], installations: readonly CiInstallation[]): Repo[] {
  const installed = new Set(installations.map((i) => i.repo));
  return repos.filter((r) => !installed.has(r.full_name));
}

/** The workflow counts as edited only while it differs from what the server generated (AC-9). */
export function isWorkflowEdited(edited: string | null, generated: string | undefined): boolean {
  return edited !== null && edited !== generated;
}

/** The files as they will be committed: the edited workflow replaces the generated one. */
export function applyWorkflowEdit(files: readonly CiFile[], edited: string | null): CiFile[] {
  if (edited === null) return [...files];
  return files.map((f) => (f.editable ? { ...f, contents: edited } : f));
}

export interface WorkflowParseError {
  /** 1-based; `null` when the parser gave no position. */
  line: number | null;
  message: string;
}

/** Parses the workflow as YAML; the first error with its line, or `null` when valid (AC-9). */
export function workflowParseError(text: string): WorkflowParseError | null {
  const err = parseDocument(text).errors[0];
  if (!err) return null;
  const message = (err.message.split("\n")[0] ?? err.message).replace(/ at line \d+, column \d+:?$/, "");
  return { line: err.linePos?.[0]?.line ?? null, message };
}

/** `devdigest-ci-<slug>.zip` (AC-17). */
export function zipFileName(slug: string): string {
  return `devdigest-ci-${slug}.zip`;
}

/** The zip of exactly the given files at their repository paths (AC-17). */
export function buildZip(files: readonly CiFile[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[f.path] = strToU8(f.contents);
  return zipSync(entries);
}

/** Saves bytes as a file download (browser only). */
export function downloadBytes(name: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
