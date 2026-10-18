/* InstallationRow — one (agent, repo) CI installation (AC-26, screenshot 2): repo, target,
   manifest version, status, last-run time, outdated/removing badge and the Remove action. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon } from "@devdigest/ui";
import type { CiInstallation } from "@devdigest/shared";
import { isGithubUrl } from "@/lib/github-urls";
import { RUN_STATUS_STYLE } from "../../constants";
import { relativeTime, rowStatus } from "../../helpers";
import { s } from "./styles";

export function InstallationRow({
  installation: i,
  agentName,
  onRemove,
}: {
  installation: CiInstallation;
  agentName: string;
  /** Receives the clicked button so the dialog can return focus to it on close. */
  onRemove: (trigger: HTMLElement) => void;
}) {
  const t = useTranslations("ci.ciTab.row");
  const status = rowStatus(i);
  const ago = relativeTime(i.last_run_at);
  const removalUrl = isGithubUrl(i.removal_pr_url) ? i.removal_pr_url : null;

  return (
    <div role="listitem" style={s.row}>
      <Icon.GitBranch size={16} style={{ color: "var(--text-muted)" }} />
      <span className="mono" style={s.repo} title={i.repo}>
        {i.repo}
      </span>
      <Badge color="var(--text-secondary)" icon="Workflow">
        {t("githubActions")}
      </Badge>
      <Badge color="var(--text-secondary)" mono>
        {t("manifestVersion", { version: i.manifest_version })}
      </Badge>
      {status.kind === "run" ? (
        <Badge color={RUN_STATUS_STYLE[status.status].color} bg={RUN_STATUS_STYLE[status.status].bg} dot>
          {t(`status.${status.status}`)}
        </Badge>
      ) : (
        <Badge color="var(--text-secondary)" dot>
          {status.kind === "manualPending" ? t("manualPending") : t("pending")}
        </Badge>
      )}
      {i.status === "outdated" && (
        <Badge color="var(--warn)" bg="var(--warn-bg)">
          {t("outdated")}
        </Badge>
      )}
      {i.status === "removing" && (
        <Badge color="var(--warn)" bg="var(--warn-bg)">
          {t("removing")}
          {removalUrl && (
            <>
              {" · "}
              <a href={removalUrl} target="_blank" rel="noopener noreferrer" style={s.prLink}>
                {t("removalPr")}
              </a>
            </>
          )}
        </Badge>
      )}
      {ago && (
        <span style={s.time}>
          {ago.unit === "justNow" ? t("justNow") : t(ago.unit, { count: ago.count })}
        </span>
      )}
      <Button
        kind="ghost"
        size="sm"
        aria-label={t("removeLabel", { agent: agentName, repo: i.repo })}
        onClick={(e) => onRemove(e.currentTarget)}
      >
        {t("remove")}
      </Button>
    </div>
  );
}
