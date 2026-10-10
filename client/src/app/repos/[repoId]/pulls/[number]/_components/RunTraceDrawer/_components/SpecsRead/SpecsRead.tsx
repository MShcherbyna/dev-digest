/* SpecsRead — the "Specs read" value of the trace Configuration section.
   With `project_context_docs`: included docs as `path · ~N tok` chips and
   skipped docs (with a localized reason) listed separately. Without it (legacy
   traces, runs with no attachments) it falls back to the plain `specs_read` chips. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { RunTraceView } from "@/lib/types";
import { s } from "../../styles";

export function SpecsRead({ trace }: { trace: RunTraceView }) {
  const t = useTranslations("runs");
  const docs = trace.project_context_docs;
  if (!docs) {
    return (
      <div style={s.specsWrap}>
        {trace.specs_read.length === 0 ? (
          <span style={s.specsNone}>{t("trace.config.none")}</span>
        ) : (
          trace.specs_read.map((sp, i) => (
            <span key={i} className="mono" style={s.spec}>
              {sp}
            </span>
          ))
        )}
      </div>
    );
  }
  const included = docs.filter((d) => d.status === "included");
  const skipped = docs.filter((d) => d.status === "skipped");
  return (
    <div style={s.specsCol}>
      <div style={s.specsWrap}>
        {included.length === 0 && skipped.length === 0 && <span style={s.specsNone}>{t("trace.config.none")}</span>}
        {included.map((d) => (
          <span key={d.path} className="mono" style={s.spec}>
            {d.tokens != null ? t("trace.config.specChip", { path: d.path, tokens: d.tokens }) : d.path}
          </span>
        ))}
      </div>
      {skipped.length > 0 && (
        <div style={s.specsWrap}>
          <span style={s.specsNone}>{t("trace.config.skipped")}</span>
          {skipped.map((d) => (
            <span key={d.path} style={s.spec}>
              <span className="mono">{d.path}</span>
              {d.reason && <span style={s.specsNone}> — {t(`trace.config.skipReason.${d.reason}`)}</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
