import type { OnboardingDiagram, OnboardingNodeKind } from "@/lib/hooks/onboarding";
import {
  CHAR_WIDTH,
  COLUMN_GAP,
  LABEL_MAX_CHARS,
  NODE_HEIGHT,
  NODE_MIN_WIDTH,
  NODE_PAD_X,
  PAD,
  ROW_GAP,
} from "./constants";

export interface LaidOutNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  column: number;
  /** Possibly truncated text shown in the node. */
  label: string;
  /** Full label, for the native tooltip. */
  title: string;
  kind: OnboardingNodeKind;
}

export interface Layout {
  width: number;
  height: number;
  nodes: LaidOutNode[];
  edges: { id: string; d: string }[];
}

export function truncateLabel(label: string): string {
  return label.length > LABEL_MAX_CHARS ? `${label.slice(0, LABEL_MAX_CHARS - 1)}…` : label;
}

/** Column = longest-path depth from the sources; back edges (cycles) are ignored. */
function columnsOf(diagram: OnboardingDiagram): Map<string, number> {
  const out = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const n of diagram.nodes) {
    out.set(n.id, []);
    indeg.set(n.id, 0);
  }
  for (const e of diagram.edges) {
    out.get(e.from)?.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }

  // DFS (sources first, then the rest in input order) to find back edges.
  const state = new Map<string, 1 | 2>();
  const back = new Set<string>();
  const visit = (id: string) => {
    state.set(id, 1);
    for (const to of out.get(id) ?? []) {
      if (state.get(to) === 1) back.add(`${id}\0${to}`);
      else if (!state.has(to)) visit(to);
    }
    state.set(id, 2);
  };
  const order = [
    ...diagram.nodes.filter((n) => indeg.get(n.id) === 0),
    ...diagram.nodes,
  ];
  for (const n of order) if (!state.has(n.id)) visit(n.id);

  const preds = new Map<string, string[]>();
  for (const n of diagram.nodes) preds.set(n.id, []);
  for (const e of diagram.edges) if (!back.has(`${e.from}\0${e.to}`)) preds.get(e.to)?.push(e.from);

  const col = new Map<string, number>();
  const depth = (id: string): number => {
    const known = col.get(id);
    if (known !== undefined) return known;
    const d = Math.max(-1, ...(preds.get(id) ?? []).map(depth)) + 1;
    col.set(id, d);
    return d;
  };
  for (const n of diagram.nodes) depth(n.id);
  return col;
}

export function layoutGraph(diagram: OnboardingDiagram): Layout {
  const col = columnsOf(diagram);
  const columnCount = Math.max(0, ...col.values()) + 1;
  const byColumn: OnboardingDiagram["nodes"][] = Array.from({ length: columnCount }, () => []);
  for (const n of diagram.nodes) byColumn[col.get(n.id) ?? 0]!.push(n);

  const widthOf = (label: string) =>
    Math.max(NODE_MIN_WIDTH, Math.round(truncateLabel(label).length * CHAR_WIDTH) + NODE_PAD_X * 2);
  const colWidths = byColumn.map((ns) => Math.max(0, ...ns.map((n) => widthOf(n.label))));
  const tallest = Math.max(...byColumn.map((ns) => ns.length), 1);
  const innerHeight = tallest * NODE_HEIGHT + (tallest - 1) * ROW_GAP;

  const nodes: LaidOutNode[] = [];
  let x = PAD;
  byColumn.forEach((ns, c) => {
    const colH = ns.length * NODE_HEIGHT + Math.max(0, ns.length - 1) * ROW_GAP;
    ns.forEach((n, i) => {
      const w = widthOf(n.label);
      nodes.push({
        id: n.id,
        x: x + (colWidths[c]! - w) / 2,
        y: PAD + (innerHeight - colH) / 2 + i * (NODE_HEIGHT + ROW_GAP),
        w,
        h: NODE_HEIGHT,
        column: c,
        label: truncateLabel(n.label),
        title: n.label,
        kind: n.kind,
      });
    });
    x += colWidths[c]! + COLUMN_GAP;
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = diagram.edges.flatMap((e, i) => {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) return [];
    return [{ id: `${e.from}->${e.to}-${i}`, d: edgePath(a, b) }];
  });

  const width = Math.max(PAD * 2, x - COLUMN_GAP + PAD);
  return { width, height: innerHeight + PAD * 2, nodes, edges };
}

function edgePath(a: LaidOutNode, b: LaidOutNode): string {
  if (a.column === b.column) {
    // Same column: vertical, bottom/top centre.
    const down = b.y >= a.y;
    const x = a.x + a.w / 2;
    return `M ${x} ${down ? a.y + a.h : a.y} V ${down ? b.y : b.y + b.h}`;
  }
  const forward = b.column > a.column;
  const x1 = forward ? a.x + a.w : a.x;
  const x2 = forward ? b.x : b.x + b.w;
  const y1 = a.y + a.h / 2;
  const y2 = b.y + b.h / 2;
  if (y1 === y2) return `M ${x1} ${y1} H ${x2}`;
  const xm = (x1 + x2) / 2;
  return `M ${x1} ${y1} H ${xm} V ${y2} H ${x2}`;
}
