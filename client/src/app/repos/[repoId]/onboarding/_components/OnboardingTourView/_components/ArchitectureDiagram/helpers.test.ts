import { describe, it, expect } from "vitest";
import type { OnboardingDiagram } from "@/lib/hooks/onboarding";
import { KIND_COLOR, LABEL_MAX_CHARS } from "./constants";
import { layoutGraph } from "./helpers";

const byId = (l: ReturnType<typeof layoutGraph>, id: string) => l.nodes.find((n) => n.id === id)!;

describe("layoutGraph", () => {
  it("places sources left of their targets, carries the kind colour key, and keeps input order within a column", () => {
    // Catches: reversed/flat column assignment, nodes dropped or reordered in a column.
    const diagram: OnboardingDiagram = {
      nodes: [
        { id: "client", label: "client", kind: "external" },
        { id: "server", label: "server.ts", kind: "entry" },
        { id: "mw", label: "middleware", kind: "middleware" },
        { id: "pg", label: "postgres", kind: "storage" },
        { id: "redis", label: "redis", kind: "storage" },
      ],
      edges: [
        { from: "client", to: "server" },
        { from: "server", to: "mw" },
        { from: "mw", to: "pg" },
        { from: "mw", to: "redis" },
      ],
    };
    const l = layoutGraph(diagram);
    expect(byId(l, "client").column).toBe(0);
    expect(byId(l, "server").column).toBe(1);
    expect(byId(l, "mw").column).toBe(2);
    expect(byId(l, "pg").column).toBe(3);
    expect(byId(l, "redis").column).toBe(3);
    expect(byId(l, "pg").y).toBeLessThan(byId(l, "redis").y);
    expect(byId(l, "client").x).toBeLessThan(byId(l, "server").x);
    expect(l.edges).toHaveLength(4);
    expect(l.nodes.map((n) => n.kind)).toEqual(["external", "entry", "middleware", "storage", "storage"]);
    expect(KIND_COLOR).toMatchObject({
      external: "var(--border-strong)",
      entry: "var(--accent)",
      service: "var(--accent)",
      middleware: "var(--warn)",
      storage: "var(--ok)",
    });
  });

  it("terminates on a cycle and still lays out every node and edge", () => {
    // Catches: infinite recursion / stack overflow on a back edge (validateDiagram allows cycles).
    const l = layoutGraph({
      nodes: [
        { id: "a", label: "a", kind: "entry" },
        { id: "b", label: "b", kind: "service" },
        { id: "c", label: "c", kind: "service" },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: "a" },
      ],
    });
    expect(l.nodes).toHaveLength(3);
    expect(l.edges).toHaveLength(3);
    expect(byId(l, "a").column).toBe(0);
    expect(byId(l, "c").column).toBe(2);
  });

  it("truncates long labels with an ellipsis but keeps the full label as the title", () => {
    // Catches: a long model label blowing out the node width, or the tooltip losing the full text.
    const long = "x".repeat(60);
    const l = layoutGraph({ nodes: [{ id: "n", label: long, kind: "service" }], edges: [] });
    const n = byId(l, "n");
    expect(n.label.length).toBe(LABEL_MAX_CHARS);
    expect(n.label.endsWith("…")).toBe(true);
    expect(n.title).toBe(long);
  });
});
