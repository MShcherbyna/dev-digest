/* FilesList — read-only files of the diff with +added −deleted counts (derived, not stored). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { DiffFile } from "../../helpers";
import { s } from "../../styles";

export function FilesList({ files }: { files: DiffFile[] }) {
  const t = useTranslations("eval.caseEditor");
  if (files.length === 0) return <div style={s.loading}>{t("filesEmpty")}</div>;
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {files.map((f) => (
        <li key={f.path} style={s.fileRow}>
          <span className="mono">{f.path}</span>
          <span className="mono">
            <span style={s.add}>+{f.additions}</span> <span style={s.del}>−{f.deletions}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
