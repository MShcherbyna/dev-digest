"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { ReviewFocusItem } from "@devdigest/shared";
import { focusLabel } from "../../helpers";
import { s } from "./styles";

/** "Review focus — read these first": one button per grounded file:line (AC-11, AC-28, AC-33). */
export function ReviewFocusCard({
  items,
  onOpen,
}: {
  items: ReviewFocusItem[];
  onOpen: (path: string, line: number) => void;
}) {
  const t = useTranslations("brief.panel");
  return (
    <section style={s.card}>
      <div style={s.header}>
        <Icon.ListChecks size={14} aria-hidden style={{ color: "var(--accent-text)" }} />
        <span style={s.label}>{t("reviewFocus")}</span>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {items.length}
        </Badge>
      </div>
      {items.length === 0 ? (
        <div style={s.empty}>{t("noFocus")}</div>
      ) : (
        <ul style={s.list}>
          {items.map((item, i) => {
            const label = focusLabel(item);
            return (
              <li key={`${i}:${item.file}:${item.line}`}>
                <button
                  type="button"
                  style={s.row}
                  aria-label={label}
                  title={label}
                  onClick={() => onOpen(item.file, item.line)}
                >
                  <span aria-hidden style={s.bullet}>
                    ▸
                  </span>
                  <span style={s.text}>
                    <span className="mono" style={s.ref}>
                      {item.file}:{item.line}
                    </span>
                    <span style={s.reason}> — {item.reason}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
