/* IndexFooter — panel footer: "Indexed: N files · M chunks" / "last <rel>[ · out of date]".
   The second line is an always-mounted polite live region so changes are announced. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { compactRelativeTime } from "@/lib/relative-time";
import type { ContextIndexInfo } from "@/lib/types";
import { s } from "../../../../styles";

export interface IndexFooterProps {
  index: ContextIndexInfo;
  stale: boolean;
  running: boolean;
}

export function IndexFooter({ index, stale, running }: IndexFooterProps) {
  const t = useTranslations("context");
  const indexedAt = index.indexed_at;
  let liveText: string;
  if (running) liveText = t("page.reindexing");
  else if (indexedAt !== null) liveText = t("page.last", { when: compactRelativeTime(indexedAt) }) + (stale ? t("page.outOfDate") : "");
  else liveText = t("page.notIndexed");
  return (
    <div style={s.footer}>
      {indexedAt !== null && (
        <span style={s.footerLine}>
          <span style={s.dot} aria-hidden="true" />
          {t("page.indexed", { files: index.files, chunks: index.chunks })}
        </span>
      )}
      <span role="status" aria-live="polite">
        {liveText}
      </span>
    </div>
  );
}
