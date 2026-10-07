import type { DownstreamImpact } from "@devdigest/shared";
import {
  CALLER_MAX_CHARS,
  CALLER_W,
  CALLER_X,
  CHAR_W,
  ENDPOINT_MAX_CHARS,
  ENDPOINT_W,
  ENDPOINT_X,
  NODE_H,
  NODE_PAD_X,
  PAD_Y,
  ROW_H,
  SYMBOL_MAX_W,
  SYMBOL_MIN_W,
  SYMBOL_X,
} from "./constants";

export type GraphNodeKind = "symbol" | "caller" | "endpoint" | "cron";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Text drawn in the node (truncated with an ellipsis when long). */
  label: string;
  /** Full, untruncated text (tooltip). */
  title: string;
  file?: string;
  line?: number;
}

export interface GraphEdge {
  id: string;
  d: string;
}

export interface GraphLayout {
  width: number;
  height: number;
  symbol: GraphNode;
  callers: GraphNode[];
  /** Endpoints first, then crons. */
  targets: GraphNode[];
  edges: GraphEdge[];
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Top y of the i-th node of an n-node column, vertically centered in `height`. */
function columnY(i: number, n: number, height: number): number {
  const colH = n * NODE_H + (n - 1) * (ROW_H - NODE_H);
  return (height - colH) / 2 + i * ROW_H;
}

/** Soft horizontal S-curve from the right edge of `a` to the left edge of `b`. */
export function curve(a: GraphNode, b: GraphNode): string {
  const x1 = a.x + a.w;
  const y1 = a.y + a.h / 2;
  const x2 = b.x;
  const y2 = b.y + b.h / 2;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

/**
 * Three columns: the selected changed symbol, its callers, and the endpoints/crons
 * in its callers' files. The response carries no per-caller attribution, so every
 * endpoint/cron is connected to every caller of the symbol's group.
 */
export function layoutGraph(group: DownstreamImpact, symbolLabel: string, viewW: number): GraphLayout {
  const targetsRaw = [
    ...group.endpoints_affected.map((text) => ({ kind: "endpoint" as const, text })),
    ...group.crons_affected.map((text) => ({ kind: "cron" as const, text })),
  ];
  // Crons sit below the endpoints, set apart by half a node height.
  const gap = group.endpoints_affected.length > 0 && group.crons_affected.length > 0 ? NODE_H / 2 : 0;
  const colHeight = (n: number) => (n === 0 ? 0 : n * NODE_H + (n - 1) * (ROW_H - NODE_H));
  const height = Math.max(colHeight(group.callers.length), colHeight(targetsRaw.length) + gap, NODE_H) + PAD_Y * 2;

  const symbol: GraphNode = {
    id: `symbol:${group.symbol}`,
    kind: "symbol",
    x: SYMBOL_X,
    y: columnY(0, 1, height),
    w: Math.min(SYMBOL_MAX_W, Math.max(SYMBOL_MIN_W, symbolLabel.length * CHAR_W + NODE_PAD_X * 2)),
    h: NODE_H,
    label: symbolLabel,
    title: symbolLabel,
  };
  const callers: GraphNode[] = group.callers.map((c, i) => ({
    id: `caller:${c.file}:${c.line}:${c.name}`,
    kind: "caller",
    x: CALLER_X,
    y: columnY(i, group.callers.length, height),
    w: CALLER_W,
    h: NODE_H,
    label: truncate(c.name, CALLER_MAX_CHARS),
    title: `${c.name} — ${c.file}:${c.line}`,
    file: c.file,
    line: c.line,
  }));
  const targets: GraphNode[] = targetsRaw.map((t, i) => ({
    id: `${t.kind}:${t.text}`,
    kind: t.kind,
    x: ENDPOINT_X,
    y: (height - colHeight(targetsRaw.length) - gap) / 2 + i * ROW_H + (t.kind === "cron" ? gap : 0),
    w: ENDPOINT_W,
    h: NODE_H,
    label: truncate(t.text, ENDPOINT_MAX_CHARS),
    title: t.text,
  }));

  const edges: GraphEdge[] = [
    ...callers.map((c) => ({ id: `${symbol.id}>${c.id}`, d: curve(symbol, c) })),
    ...callers.flatMap((c) => targets.map((t) => ({ id: `${c.id}>${t.id}`, d: curve(c, t) }))),
  ];
  return { width: viewW, height, symbol, callers, targets, edges };
}
