/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SEV } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type Line } from "../helpers";
import { type DiffFindingsApi } from "../findings";
import { worstSeverity } from "../findings";
import { s, lineRowFor, lineSignFor, findingLineLabel, findingStripeFor } from "../styles";
import { LABELED_SEVERITIES } from "../constants";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  findings,
  renderFinding,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  findings?: FindingRecord[];
  renderFinding?: DiffFindingsApi["renderFinding"];
}) {
  const t = useTranslations("shell");
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;
  const hasFindings = !!findings && findings.length > 0;
  const worst = hasFindings ? worstSeverity(findings!) : null;
  const rowStyle = worst
    ? { ...lineRowFor(ln.kind), ...findingStripeFor(SEV[worst].c) }
    : lineRowFor(ln.kind);
  const hasLabel = !!worst && LABELED_SEVERITIES.includes(worst);

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={rowStyle}>
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {worst && hasLabel && (
          <span style={findingLineLabel(SEV[worst].c)}>{t(`diffViewer.findingLabel.${worst}`)}</span>
        )}
      </div>

      {hasFindings && (
        <div style={s.findingRail}>
          {findings!.map((f) => (
            <React.Fragment key={f.id}>{renderFinding?.(f)}</React.Fragment>
          ))}
        </div>
      )}

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
