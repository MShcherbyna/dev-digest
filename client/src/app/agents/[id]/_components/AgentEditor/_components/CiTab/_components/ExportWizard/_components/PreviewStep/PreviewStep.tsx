/* PreviewStep — step 2: every file that will be committed (AC-4). Only the workflow is
   editable; it is parsed as YAML on every change and a parse error (with its line) blocks
   Continue (AC-9). The manifest pane carries the "Runs via OpenRouter as <id>" note (AC-6).
   The panes scroll (E-15). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon } from "@devdigest/ui";
import type { CiFile, CiPreviewNote } from "@devdigest/shared";
import { ciErrorMessage } from "../../../../ci-errors";
import { MANIFEST_PREFIX } from "../../constants";
import type { WorkflowParseError } from "../../helpers";
import { s } from "./styles";

export function PreviewStep({
  files,
  selectedPath,
  onSelect,
  workflowText,
  onEdit,
  workflowError,
  notes,
  pending,
  error,
  onRetry,
}: {
  files: CiFile[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  workflowText: string;
  onEdit: (text: string) => void;
  workflowError: WorkflowParseError | null;
  notes: CiPreviewNote[];
  pending: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const t = useTranslations("ci.exportWizard");
  const tc = useTranslations("ci");

  if (pending) return <div style={s.state}>{t("generating")}</div>;
  if (error || files.length === 0) {
    return (
      <div role="alert" style={s.state}>
        <span>
          {t("previewFailed")}
          {error ? ` — ${ciErrorMessage(tc, error)}` : ""}
        </span>
        <Button kind="secondary" size="sm" icon="RefreshCw" onClick={onRetry}>
          {t("retry")}
        </Button>
      </div>
    );
  }

  const selected = files.find((f) => f.path === selectedPath) ?? files.find((f) => f.editable) ?? files[0]!;
  const isManifest = selected.path.startsWith(MANIFEST_PREFIX);
  const openRouterId = isManifest ? notes.find((n) => n.kind === "openrouter_id")?.id : null;
  const isRunner = !selected.editable && selected.path.startsWith(".devdigest/runner/");

  return (
    <div>
      <div style={s.grid}>
        <div style={s.list}>
          <div style={s.listLabel}>{t("filesToCreate")}</div>
          {files.map((f) => {
            const active = f.path === selected.path;
            return (
              <button
                key={f.path}
                type="button"
                aria-current={active ? "true" : undefined}
                onClick={() => onSelect(f.path)}
                style={{ ...s.file, ...(active ? s.fileActive : null) }}
              >
                <Icon.FileText size={13} style={{ color: active ? "var(--accent)" : "var(--text-muted)", flexShrink: 0, marginTop: 2 }} />
                <span className="mono" style={{ color: active ? "var(--accent-text)" : "var(--text-secondary)" }}>
                  {f.path}
                </span>
              </button>
            );
          })}
        </div>
        <div style={s.pane}>
          <div style={s.paneHead}>
            <span className="mono" style={s.panePath} title={selected.path}>
              {selected.path}
            </span>
            {selected.editable && (
              <Badge color="var(--text-muted)" icon="Edit">
                {t("editable")}
              </Badge>
            )}
            {isRunner && <Badge color="var(--text-muted)">{t("generatedNotEditable")}</Badge>}
          </div>
          {openRouterId && <div style={s.note}>{t("openRouterNote", { id: openRouterId })}</div>}
          {selected.editable ? (
            <textarea
              className="mono"
              aria-label={t("editorLabel", { path: selected.path })}
              aria-invalid={workflowError ? true : undefined}
              spellCheck={false}
              value={workflowText}
              onChange={(e) => onEdit(e.target.value)}
              style={{ ...s.code, ...s.editor }}
            />
          ) : (
            <pre className="mono" tabIndex={0} aria-label={t("paneLabel", { path: selected.path })} style={s.code}>
              {selected.contents}
            </pre>
          )}
        </div>
      </div>
      {workflowError && (
        <p role="alert" style={s.error}>
          {workflowError.line !== null
            ? t("workflowInvalid", { line: workflowError.line, message: workflowError.message })
            : t("workflowInvalidNoLine", { message: workflowError.message })}
        </p>
      )}
    </div>
  );
}
