/* DisagreementBlock — "Where agents disagree" (AC-24, AC-25). */
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import type { AgentColumnView, Conflict } from "@/lib/types";
import { DisagreementBlock } from "./DisagreementBlock";

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
    summary: null,
    duration_ms: 4000,
    cost_usd: 0.03,
    findings: [],
    ...o,
  };
}

function conflict(o: Partial<Conflict>): Conflict {
  return {
    file: "src/a.ts",
    line: 10,
    title: "SQL injection",
    takes: [],
    ...o,
  };
}

describe("DisagreementBlock", () => {
  it("renders the full EmptyState pattern (icon + title + body) when no agent has a verdict yet", () => {
    const columns = [column({ run_id: "r1", agent_id: "a1", status: "running", score: null })];
    renderWithIntl(
      <DisagreementBlock conflicts={[]} columns={columns} onlyConflicts={false} onToggleOnlyConflicts={() => {}} />,
    );
    expect(screen.getByText("No verdicts yet")).toBeInTheDocument();
    expect(screen.getByText("No agent has produced a verdict for this run yet.")).toBeInTheDocument();
  });

  it("renders the full EmptyState pattern when agents agree on every flagged location", () => {
    const columns = [
      column({ run_id: "r1", agent_id: "a1", agent_name: "Security" }),
      column({ run_id: "r2", agent_id: "a2", agent_name: "Performance" }),
    ];
    const conflicts = [
      conflict({
        file: "agree.ts",
        takes: [
          { agent_id: "a1", persona: "security", verdict: "WARNING", note: "" },
          { agent_id: "a2", persona: "performance", verdict: "WARNING", note: "" },
        ],
      }),
    ];
    renderWithIntl(
      <DisagreementBlock conflicts={conflicts} columns={columns} onlyConflicts={true} onToggleOnlyConflicts={() => {}} />,
    );
    expect(screen.getByText("No overlapping findings")).toBeInTheDocument();
    expect(screen.getByText("No two agents flagged the same location in this run.")).toBeInTheDocument();
  });


  it("AC-24: a failed agent's cell always reads 'failed, no verdict', never 'did not flag', at every location", () => {
    const columns = [
      column({ run_id: "r1", agent_id: "a1", agent_name: "Security" }),
      column({ run_id: "r2", agent_id: "a2", agent_name: "Performance", status: "failed", score: null }),
    ];
    const conflicts = [
      conflict({ file: "a.ts", line: 10, takes: [{ agent_id: "a1", persona: "security", verdict: "WARNING", note: "n" }] }),
      conflict({ file: "b.ts", line: 20, takes: [{ agent_id: "a1", persona: "security", verdict: "CRITICAL", note: "n2" }] }),
    ];
    renderWithIntl(
      <DisagreementBlock conflicts={conflicts} columns={columns} onlyConflicts={false} onToggleOnlyConflicts={() => {}} />,
    );
    const failedCells = screen.getAllByText("failed, no verdict");
    expect(failedCells).toHaveLength(2);
    expect(screen.queryByText("did not flag")).not.toBeInTheDocument();
  });

  it("AC-25: 'Show only conflicts' hides agreement locations and restores them when toggled off", async () => {
    const columns = [
      column({ run_id: "r1", agent_id: "a1", agent_name: "Security" }),
      column({ run_id: "r2", agent_id: "a2", agent_name: "Performance" }),
    ];
    const conflicts = [
      conflict({
        file: "agree1.ts",
        title: "Agreement one",
        takes: [
          { agent_id: "a1", persona: "security", verdict: "WARNING", note: "" },
          { agent_id: "a2", persona: "performance", verdict: "WARNING", note: "" },
        ],
      }),
      conflict({
        file: "agree2.ts",
        title: "Agreement two",
        takes: [
          { agent_id: "a1", persona: "security", verdict: "ignored", note: "" },
          { agent_id: "a2", persona: "performance", verdict: "ignored", note: "" },
        ],
      }),
      conflict({
        file: "conflict1.ts",
        title: "The real conflict",
        takes: [
          { agent_id: "a1", persona: "security", verdict: "WARNING", note: "" },
          { agent_id: "a2", persona: "performance", verdict: "ignored", note: "" },
        ],
      }),
    ];

    // A state-holding harness, not `rerender` (which drops the intl provider
    // on re-render — see client/INSIGHTS.md).
    function Harness() {
      const [onlyConflicts, setOnlyConflicts] = React.useState(false);
      return (
        <DisagreementBlock conflicts={conflicts} columns={columns} onlyConflicts={onlyConflicts} onToggleOnlyConflicts={setOnlyConflicts} />
      );
    }
    renderWithIntl(<Harness />);
    expect(screen.getByText("Agreement one")).toBeInTheDocument();
    expect(screen.getByText("Agreement two")).toBeInTheDocument();
    expect(screen.getByText("The real conflict")).toBeInTheDocument();

    // F-6: the toggle's accessible name comes from being wrapped in a
    // <label> with the "Show only conflicts" text (the vendored Toggle has
    // no aria-label support of its own).
    const toggle = screen.getByRole("switch", { name: "Show only conflicts" });
    await userEvent.click(toggle);
    expect(screen.queryByText("Agreement one")).not.toBeInTheDocument();
    expect(screen.queryByText("Agreement two")).not.toBeInTheDocument();
    expect(screen.getByText("The real conflict")).toBeInTheDocument();

    await userEvent.click(toggle);
    expect(screen.getByText("Agreement one")).toBeInTheDocument();
    expect(screen.getByText("Agreement two")).toBeInTheDocument();
  });
});
