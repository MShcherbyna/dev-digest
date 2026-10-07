"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Avatar, Icon } from "@devdigest/ui";
import { githubPrUrl } from "@/lib/github-urls";
import { usePriorPrs } from "@/lib/hooks/blast";
import { shortDate } from "./helpers";
import { s } from "./styles";

interface PriorPrsProps {
  prId: string | null | undefined;
  repoFullName: string | null;
}

/**
 * "Prior PRs touching these files" (3.png collapsed, 7.png/10.png expanded). Renders nothing
 * while loading, on error, when GitHub is unavailable or when there is no history: the block is
 * a nice-to-have and must never look broken. PR titles/notes/logins are untrusted: plain text only.
 */
export function PriorPrs({ prId, repoFullName }: PriorPrsProps) {
  const t = useTranslations("blast.history");
  const { data } = usePriorPrs(prId);
  const [open, setOpen] = React.useState(false);

  if (!data || !data.available || data.history.length === 0) return null;

  return (
    <div style={s.wrap}>
      <div style={s.box}>
        <button type="button" aria-expanded={open} style={s.head(open)} onClick={() => setOpen((o) => !o)}>
          <Icon.History size={15} aria-hidden style={{ color: "var(--text-muted)" }} />
          <span style={s.title}>{t("title")}</span>
          <span style={s.count}>{data.history.length}</span>
          <Icon.ChevronDown size={16} aria-hidden style={s.chevron(open)} />
        </button>
        {open && (
          <ol aria-label={t("listLabel")} style={s.list}>
            {data.history.map((pr, i) => (
              <li key={pr.pr_number} style={s.item(i === 0)}>
                <span aria-hidden style={s.dot} />
                <span aria-hidden style={s.line} />
                <div style={s.row1}>
                  {repoFullName ? (
                    <a
                      href={githubPrUrl(repoFullName, pr.pr_number)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={s.num}
                    >
                      #{pr.pr_number}
                    </a>
                  ) : (
                    <span style={s.num}>#{pr.pr_number}</span>
                  )}
                  <span style={s.prTitle}>{pr.title}</span>
                </div>
                <div style={s.byline}>
                  <Avatar name={pr.author} size={14} />
                  <span>{t("byline", { author: pr.author, date: shortDate(pr.merged_at) })}</span>
                </div>
                {pr.notes && <p style={s.note}>{pr.notes}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
