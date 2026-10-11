import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingDiagram } from "@/lib/hooks/onboarding";
import { KIND_COLOR } from "./constants";
import { layoutGraph } from "./helpers";
import { s } from "./styles";

/** Custom SVG node graph. All text is React text nodes (labels come from the model). */
export function ArchitectureDiagram({ diagram }: { diagram: OnboardingDiagram }) {
  const t = useTranslations("onboarding");
  const layout = React.useMemo(() => layoutGraph(diagram), [diagram]);
  const aria = t("diagramAria", { nodes: diagram.nodes.map((n) => n.label).join(", ") });
  return (
    <div style={s.panel}>
      <svg
        role="img"
        aria-label={aria}
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        style={s.svg}
      >
        <defs>
          <marker id="tour-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="var(--text-muted)" strokeWidth="1.4" />
          </marker>
        </defs>
        {layout.edges.map((e) => (
          <path key={e.id} d={e.d} fill="none" stroke="var(--text-muted)" strokeWidth="1.2" markerEnd="url(#tour-arrow)" />
        ))}
        {layout.nodes.map((n) => (
          <g key={n.id} data-kind={n.kind}>
            <title>{n.title}</title>
            <rect
              x={n.x}
              y={n.y}
              width={n.w}
              height={n.h}
              rx={7}
              fill="var(--bg-primary)"
              stroke={KIND_COLOR[n.kind]}
              strokeWidth={1.5}
            />
            <text
              x={n.x + n.w / 2}
              y={n.y + n.h / 2}
              textAnchor="middle"
              dominantBaseline="central"
              className="mono"
              fontSize={12.5}
              fill="var(--text-primary)"
            >
              {n.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
