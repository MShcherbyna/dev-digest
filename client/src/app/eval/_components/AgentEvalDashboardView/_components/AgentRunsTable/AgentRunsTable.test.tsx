import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { agentRun } from "@/test/eval-fixtures";
import type { EvalAgentRun } from "@/lib/hooks/eval";
import { AgentRunsTable } from "./AgentRunsTable";

afterEach(cleanup);

function Harness({ runs, onCompare = () => {} }: { runs: EvalAgentRun[]; onCompare?: () => void }) {
  const [selected, setSelected] = React.useState<string[]>([]);
  return <AgentRunsTable runs={runs} selected={selected} onSelectedChange={setSelected} onCompare={onCompare} comparing={false} />;
}

const rowOf = (text: string | RegExp) =>
  screen.getAllByRole("row").find((r) => (typeof text === "string" ? r.textContent?.includes(text) : text.test(r.textContent ?? "")))!;

describe("AgentRunsTable", () => {
  it("renders one row variant per run status; only finished runs are selectable", () => {
    // Catches: running/failed rows showing metric bars or a checkbox (they cannot be compared),
    // the failed reason missing from the tooltip, the partial tag lost, null cost shown as $0.00.
    renderWithIntl(
      <Harness
        runs={[
          agentRun({ id: "d", agent_version: 5, cost_usd: 0.1234, cases_passed: 4, cases_executed: 5 }),
          agentRun({ id: "p", agent_version: 4, status: "partial", cost_usd: null, recall: null }),
          agentRun({ id: "r", agent_version: 3, status: "running", recall: null, precision: null, citation_accuracy: null, cases_executed: 2, cases_errored: 1, cases_total: 6 }),
          agentRun({ id: "f", agent_version: 2, status: "failed", reason: "missing_api_key", recall: null, precision: null, citation_accuracy: null }),
        ]}
      />,
    );

    const done = rowOf("v5");
    expect(within(done).getByRole("checkbox", { name: /Select run v5/ })).toBeInTheDocument();
    expect(done).toHaveTextContent("4/5");
    expect(done).toHaveTextContent("$0.12");

    const partial = rowOf("v4");
    expect(within(partial).getByText("partial")).toBeInTheDocument();
    expect(within(partial).getByRole("checkbox")).toBeInTheDocument();
    expect(within(partial).getByLabelText("no data")).toBeInTheDocument(); // null recall
    expect(partial).not.toHaveTextContent("$0.00");
    expect(partial).toHaveTextContent("—"); // null cost

    const running = rowOf("v3");
    expect(running).toHaveTextContent("Running… 3/6");
    expect(within(running).queryByRole("checkbox")).not.toBeInTheDocument();

    const failed = rowOf("v2");
    expect(within(failed).getByText("failed")).toHaveAttribute("title", "No API key for the agent's provider");
    expect(within(failed).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });

  it("enables Compare only with exactly two runs and blocks a third selection with a hint", async () => {
    // Catches: Compare enabled with 0/1 runs, a third run silently replacing or joining the
    // pair, and the hint missing/not clearing (P2-AC-9/10).
    const onCompare = vi.fn();
    renderWithIntl(
      <Harness
        onCompare={onCompare}
        runs={[agentRun({ id: "a", agent_version: 1 }), agentRun({ id: "b", agent_version: 2 }), agentRun({ id: "c", agent_version: 3 })]}
      />,
    );
    const compare = screen.getByRole("button", { name: "Compare" });
    const box = (v: number) => screen.getByRole("checkbox", { name: new RegExp(`Select run v${v} `) });

    expect(compare).toBeDisabled();
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();

    await userEvent.click(box(1));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(compare).toBeDisabled();

    await userEvent.click(box(2));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(compare).toBeEnabled();

    await userEvent.click(box(3));
    expect(box(3)).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.getByText("Compare takes exactly two runs")).toBeInTheDocument();

    await userEvent.click(box(1)); // freeing a slot clears the hint
    expect(screen.queryByText("Compare takes exactly two runs")).not.toBeInTheDocument();
    expect(compare).toBeDisabled();
    await userEvent.click(box(3));
    expect(compare).toBeEnabled();
    await userEvent.click(compare);
    expect(onCompare).toHaveBeenCalledTimes(1);
  });

  it("shows the first 50 runs and reveals the rest on Show more", async () => {
    // Catches: rendering thousands of rows at once, or never offering the remaining runs (P2-E-9).
    const runs = Array.from({ length: 51 }, (_, i) => agentRun({ id: `r${i}`, agent_version: i + 1 }));
    renderWithIntl(<Harness runs={runs} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(50);
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(51);
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });
});
