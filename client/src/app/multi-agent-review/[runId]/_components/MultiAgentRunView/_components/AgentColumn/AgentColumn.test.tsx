/* AgentColumn — one agent's column in the Columns view (AC-18, AC-19, AC-22, AC-28). */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import type { AgentColumnView } from "@/lib/types";
import { AgentColumn } from "./AgentColumn";

vi.mock("@/lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

afterEach(cleanup);

function column(o: Partial<AgentColumnView>): AgentColumnView {
  return {
    run_id: "run-1",
    agent_id: "agent-1",
    agent_name: "Security",
    provider: "anthropic",
    model: "claude",
    status: "done",
    verdict: "request_changes",
    score: 80,
    summary: "ok",
    duration_ms: 4000,
    cost_usd: 0.03,
    findings: [],
    ...o,
  };
}

function finding(o: Partial<AgentColumnView["findings"][number]>) {
  return {
    id: "f1",
    severity: "WARNING" as const,
    category: "security",
    title: "A very long finding title that should truncate in the column card UI",
    file: "src/a.ts",
    start_line: 10,
    end_line: 10,
    confidence: 0.8,
    rationale: "because",
    suggested_fix: null,
    group_id: "g1",
    ...o,
  };
}

const noop = () => {};

describe("AgentColumn", () => {
  it("AC-18: each status renders its own chip/content, independent of other states", () => {
    // queued and running show a status Badge instead of the score ring
    renderWithIntl(<AgentColumn column={column({ status: "queued", score: null })} onOpenTrace={noop} onCancel={noop} onRetry={noop} similarAgentNames={() => []} />);
    expect(screen.getByText("queued")).toBeInTheDocument();
    cleanup();

    renderWithIntl(<AgentColumn column={column({ status: "running", score: null })} onOpenTrace={noop} onCancel={noop} onRetry={noop} similarAgentNames={() => []} />);
    expect(screen.getByText("running")).toBeInTheDocument();
    cleanup();

    renderWithIntl(<AgentColumn column={column({ status: "done", score: 80 })} onOpenTrace={noop} onCancel={noop} onRetry={noop} similarAgentNames={() => []} />);
    // done shows the score ring (number), not a status chip
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("80")).toBeInTheDocument();
  });

  it("AC-22/truncation: a grouped finding shows 'also flagged by' with 2 agent names, and its title carries a `title` attribute for truncation", () => {
    const f = finding({});
    renderWithIntl(
      <AgentColumn
        column={column({ status: "done", findings: [f] })}
        onOpenTrace={noop}
        onCancel={noop}
        onRetry={noop}
        similarAgentNames={() => ["Performance", "Mentor"]}
      />,
    );
    expect(screen.getByText("also flagged by: Performance, Mentor")).toBeInTheDocument();
    const titleEl = screen.getByText(f.title);
    expect(titleEl).toHaveAttribute("title", f.title);
  });

  it("AC-28/AC-19: 'View trace' opens this column's own run id; the footer action matches status (cancel on running, count on failed/done)", async () => {
    const onOpenTrace = vi.fn();
    const onRetry = vi.fn();
    renderWithIntl(
      <AgentColumn column={column({ status: "failed", score: null })} onOpenTrace={onOpenTrace} onCancel={noop} onRetry={onRetry} similarAgentNames={() => []} />,
    );
    await userEvent.click(screen.getByText("View trace"));
    expect(onOpenTrace).toHaveBeenCalledTimes(1);
    // Retry lives next to the status badge, not the footer, for a failed agent.
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
    cleanup();

    const onCancel = vi.fn();
    renderWithIntl(
      <AgentColumn column={column({ status: "running", score: null })} onOpenTrace={noop} onCancel={onCancel} onRetry={noop} similarAgentNames={() => []} />,
    );
    await userEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    cleanup();

    renderWithIntl(
      <AgentColumn column={column({ status: "done", findings: [finding({})] })} onOpenTrace={noop} onCancel={noop} onRetry={noop} similarAgentNames={() => []} />,
    );
    // A done agent already has a score ring; retry is only offered on failed (AC-19: only a failed attempt is retryable).
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
    expect(screen.getByText("1 finding")).toBeInTheDocument();
  });
});
