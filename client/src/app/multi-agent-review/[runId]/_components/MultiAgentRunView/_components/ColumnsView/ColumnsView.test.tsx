/* ColumnsView — grid wraps at a max of 4 columns per row, instead of a
   horizontally-scrolling row that clips extra agents past the page edge. */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-intl";
import type { AgentColumnView } from "@/lib/types";
import { ColumnsView } from "./ColumnsView";

vi.mock("@/lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

afterEach(cleanup);

function column(o: Partial<AgentColumnView>): AgentColumnView {
  return {
    run_id: `run-${Math.random()}`,
    agent_id: "a1",
    agent_name: "Security",
    provider: "anthropic",
    model: "claude",
    status: "done",
    verdict: null,
    score: 80,
    summary: null,
    duration_ms: 1000,
    cost_usd: 0.01,
    findings: [],
    ...o,
  };
}

const noop = () => {};

describe("ColumnsView", () => {
  it("grid-templates at min(agentCount, 4) tracks: 2 agents share the row, 6 agents cap at 4 tracks", () => {
    const two = [column({ agent_name: "A" }), column({ agent_name: "B" })];
    const { container, unmount } = renderWithIntl(
      <ColumnsView columns={two} onOpenTrace={noop} onCancel={noop} onRetry={noop} />,
    );
    expect(container.firstElementChild).toHaveStyle({ gridTemplateColumns: "repeat(2, minmax(260px, 1fr))" });
    unmount();

    const six = Array.from({ length: 6 }, (_, i) => column({ agent_name: `Agent ${i}` }));
    renderWithIntl(<ColumnsView columns={six} onOpenTrace={noop} onCancel={noop} onRetry={noop} />);
    const grid = screen.getByText("Agent 0").closest("div[style*='grid-template-columns']");
    expect(grid).toHaveStyle({ gridTemplateColumns: "repeat(4, minmax(260px, 1fr))" });
  });
});
