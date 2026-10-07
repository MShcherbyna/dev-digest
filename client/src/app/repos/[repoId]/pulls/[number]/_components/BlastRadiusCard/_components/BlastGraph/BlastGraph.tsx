"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { githubBlobUrl } from "@/lib/github-urls";
import type { BlastRadiusResponse } from "@/lib/hooks/blast";
import { symbolLabel } from "../../helpers";
import { VIEW_W, NODE_PAD_X } from "./constants";
import { layoutGraph, type GraphNode } from "./helpers";
import { s } from "./styles";

interface BlastGraphProps {
  data: BlastRadiusResponse;
  repoFullName: string | null;
  /** Fallback commit for caller links when the index commit is unknown. */
  headSha: string;
}

function NodeShape({ node, href }: { node: GraphNode; href?: string }) {
  const body = (
    <>
      {node.title !== node.label && <title>{node.title}</title>}
      <rect x={node.x} y={node.y} width={node.w} height={node.h} rx={7} style={s.rect(node.kind)} />
      <text
        x={node.kind === "endpoint" || node.kind === "cron" ? node.x + NODE_PAD_X + 10 : node.x + node.w / 2}
        y={node.y + node.h / 2}
        textAnchor={node.kind === "endpoint" || node.kind === "cron" ? "start" : "middle"}
        dominantBaseline="central"
        style={s.text(node.kind)}
      >
        {node.label}
      </text>
    </>
  );
  return href ? (
    <a href={href} aria-label={node.title} target="_blank" rel="noopener noreferrer">
      {body}
    </a>
  ) : (
    <g>{body}</g>
  );
}

/** Graph view (4.png): one selected changed symbol -> its callers -> endpoints/crons. */
export function BlastGraph({ data, repoFullName, headSha }: BlastGraphProps) {
  const t = useTranslations("blast");
  const [selected, setSelected] = React.useState<string | null>(null);
  const ref = data.ref_sha ?? headSha;

  // Derived: the user's pick if it still exists, else the first symbol with callers.
  const group = data.downstream.find((g) => g.symbol === selected) ?? data.downstream[0];
  if (!group) return <p>{t("graph.empty")}</p>;

  const layout = layoutGraph(group, symbolLabel(group.symbol, data.changed_symbols), VIEW_W);
  const callerHref = (n: GraphNode) =>
    repoFullName && n.file ? githubBlobUrl(repoFullName, ref, n.file, n.line) : undefined;

  return (
    <div style={s.wrap}>
      {data.downstream.length > 1 && (
        <label style={s.picker}>
          {t("graph.symbolPicker")}
          <select style={s.select} value={group.symbol} onChange={(e) => setSelected(e.target.value)}>
            {data.downstream.map((g) => (
              <option key={g.symbol} value={g.symbol}>
                {symbolLabel(g.symbol, data.changed_symbols)}
              </option>
            ))}
          </select>
        </label>
      )}
      <svg
        role="group"
        aria-label={t("graph.ariaLabel")}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        style={s.svg}
      >
        {layout.edges.map((e) => (
          <path key={e.id} d={e.d} style={s.edge} />
        ))}
        <NodeShape node={layout.symbol} />
        {layout.callers.map((n) => (
          <NodeShape key={n.id} node={n} href={callerHref(n)} />
        ))}
        {layout.targets.map((n) => (
          <NodeShape key={n.id} node={n} />
        ))}
      </svg>
      <div style={s.legend}>
        {/* The crons item only appears when the graph has cron nodes, so cron-free graphs match 4.png. */}
        {(group.crons_affected.length > 0
          ? (["symbol", "callers", "endpoints", "crons"] as const)
          : (["symbol", "callers", "endpoints"] as const)
        ).map((k) => (
          <span key={k} style={s.legendItem}>
            <span aria-hidden style={s.dot} />
            {t(`graph.legend.${k}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
