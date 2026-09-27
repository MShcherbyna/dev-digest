/* SmartDiffGroups — the "Files changed" tab's role-grouped view: collapsible
   sections (core → tests → wiring → docs → boilerplate) of FileCards, each
   header showing the role label, description, finding-files dot, and file
   count. Docs/Boilerplate start collapsed. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { SmartDiffRole } from "@devdigest/shared";
import { FileCard, type DiffCommentApi, type DiffFindingsApi } from "@/components/diff-viewer";
import type { ViewGroup } from "../../helpers";
import { DEFAULT_COLLAPSED_ROLES, ROLE_COLOR, ROLE_TEXT } from "./constants";
import { s, chevronFor } from "./styles";

function GroupSection({
  group,
  reviewed,
  open,
  onToggle,
  commenting,
  findings,
}: {
  group: ViewGroup;
  reviewed: boolean;
  open: boolean;
  onToggle: () => void;
  commenting?: DiffCommentApi;
  findings?: DiffFindingsApi;
}) {
  const t = useTranslations("prReview");
  const text = ROLE_TEXT[group.role];

  return (
    <div style={s.section}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        style={s.header}
      >
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <span aria-hidden style={{ ...s.roleDot, background: ROLE_COLOR[group.role] }} />
        <span style={s.label}>{t(text.label)}</span>
        <span style={s.description}>— {t(text.description)}</span>
        <span style={s.spacer} />
        {!reviewed && <span style={s.notReviewed}>{t("smartDiff.notReviewed")}</span>}
        {reviewed && group.findingFiles > 0 && (
          <span
            style={s.findingFilesDot}
            aria-label={t("smartDiff.filesWithFindings", { count: group.findingFiles })}
          >
            ● {group.findingFiles}
          </span>
        )}
        <span style={s.filesCount}>{t("smartDiff.filesCount", { count: group.files.length })}</span>
      </div>
      {open && (
        <div style={s.body}>
          {!reviewed && <div style={s.hint}>{t("smartDiff.notReviewedHint")}</div>}
          {group.files.map((f) => (
            <FileCard key={f.path} file={f} commenting={commenting} findings={findings} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SmartDiffGroups({
  groups,
  reviewed,
  commenting,
  findings,
}: {
  groups: ViewGroup[];
  reviewed: boolean;
  commenting?: DiffCommentApi;
  findings?: DiffFindingsApi;
}) {
  const [collapsed, setCollapsed] = React.useState<Set<SmartDiffRole>>(
    () => new Set(DEFAULT_COLLAPSED_ROLES),
  );

  const toggle = (role: SmartDiffRole) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };

  return (
    <div style={s.groupsList}>
      {groups.map((g) => (
        <GroupSection
          key={g.role}
          group={g}
          reviewed={reviewed}
          open={!collapsed.has(g.role)}
          onToggle={() => toggle(g.role)}
          commenting={commenting}
          findings={findings}
        />
      ))}
    </div>
  );
}
