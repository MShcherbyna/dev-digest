/* InstallStep — step 4: open a PR or copy a zip (AC-13). Shows the install blocker
   (AC-31/32), the typed failure with Retry (AC-16) and, once installed, the "PR opened"
   panel (AC-14) or the zip confirmation (AC-17). The docs link is decision D-5. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon } from "@devdigest/ui";
import type { CiInstallMode } from "@devdigest/shared";
import { isGithubUrl } from "@/lib/github-urls";
import { ciErrorMessage } from "../../../../ci-errors";
import { GITHUB_DOCS_URL } from "../../constants";
import { RadioOption } from "../RadioOption";
import { s } from "./styles";

export interface InstallDone {
  mode: CiInstallMode;
  prUrl: string | null;
  zipName: string;
}

export function InstallStep({
  repo,
  fileCount,
  installMode,
  onInstallMode,
  updating,
  block,
  error,
  onRetry,
  done,
}: {
  repo: string;
  fileCount: number;
  installMode: CiInstallMode;
  onInstallMode: (m: CiInstallMode) => void;
  /** An existing installation is being updated (the PR text differs). */
  updating: boolean;
  /** `multi_agent_unsupported` / `agent_slug_conflict` → Install is disabled with this reason. */
  block: string | null;
  error: unknown;
  onRetry: () => void;
  done: InstallDone | null;
}) {
  const t = useTranslations("ci.exportWizard");
  const tc = useTranslations("ci");

  if (done) {
    const prLink = isGithubUrl(done.prUrl) ? done.prUrl : null;
    return (
      <div style={s.done} role="status">
        <Icon.CheckCircle size={30} style={{ color: "var(--ok)" }} />
        {done.mode === "pr" ? (
          <>
            <h3 style={s.doneTitle}>{t("prOpenedTitle")}</h3>
            <p style={s.doneBody}>{t("prOpenedBody", { repo, count: fileCount })}</p>
            {prLink && (
              <a href={prLink} target="_blank" rel="noopener noreferrer" style={s.doneLink}>
                {t("viewPr")}
              </a>
            )}
          </>
        ) : (
          <>
            <h3 style={s.doneTitle}>{t("zipDoneTitle")}</h3>
            <p style={s.doneBody}>{t("zipDoneBody", { name: done.zipName, repo })}</p>
          </>
        )}
      </div>
    );
  }

  const body = t.rich(updating ? "installCardBodyUpdate" : "installCardBody", {
    repo,
    count: fileCount,
    mono: (chunks) => <span className="mono">{chunks}</span>,
  });

  return (
    <div style={s.wrap}>
      <div role="radiogroup" aria-label={t("installGroupLabel")} style={s.options}>
        <RadioOption
          name="ci-install-mode"
          value="pr"
          checked={installMode === "pr"}
          onSelect={() => onInstallMode("pr")}
          style={s.prCard}
          checkedStyle={s.prCardChecked}
        >
          <div style={s.head}>
            <Icon.GitPullRequest size={18} style={{ color: "var(--accent)" }} />
            <span style={s.title}>{t("installCardTitle")}</span>
            <Badge color="var(--accent-text)" bg="var(--bg-elevated)" style={{ marginLeft: "auto" }}>
              {t("recommended")}
            </Badge>
          </div>
          <p style={s.body}>{body}</p>
        </RadioOption>
        <RadioOption
          name="ci-install-mode"
          value="manual"
          checked={installMode === "manual"}
          onSelect={() => onInstallMode("manual")}
          style={s.zipCard}
          checkedStyle={s.zipCardChecked}
        >
          <div style={s.head}>
            <Icon.Copy size={16} style={{ color: "var(--text-secondary)" }} />
            <span style={s.zipTitle}>{t("zipTitle")}</span>
            <span style={s.zipHint}>{t("zipHint")}</span>
          </div>
        </RadioOption>
      </div>

      {block && (
        <p role="alert" style={s.blocked}>
          {t.has(`installBlocked.${block}`) ? t(`installBlocked.${block}`) : block}
        </p>
      )}
      {error !== null && error !== undefined && (
        <div role="alert" style={s.error}>
          <span style={s.errorText}>{ciErrorMessage(tc, error)}</span>
          <Button kind="secondary" size="sm" icon="RefreshCw" onClick={onRetry}>
            {t("retry")}
          </Button>
        </div>
      )}

      <p style={s.help}>
        {t("docsPrefix")}{" "}
        <a href={GITHUB_DOCS_URL} target="_blank" rel="noopener noreferrer" style={s.helpLink}>
          {t("docsLink")} →
        </a>
      </p>
    </div>
  );
}
