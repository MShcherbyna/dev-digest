import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-intl";
import user from "@/test/user";

vi.mock("@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer", () => ({
  RunTraceDrawer: ({ runId, onClose }: { runId: string; onClose: () => void }) => (
    <div role="dialog" aria-label={`trace ${runId}`}>
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

import { RunHistoryTable } from "./RunHistoryTable";

afterEach(cleanup);

const runs = [
  {
    run_id: "run-1",
    ran_at: new Date(2026, 5, 1, 9, 14).toISOString(),
    pr_number: 482,
    repo_id: "repo-9",
    tokens: 16_000,
    cost_usd: 0.06,
    findings: 3,
    source: "local" as const,
  },
  {
    run_id: "run-2",
    ran_at: new Date(2026, 5, 2, 10, 0).toISOString(),
    pr_number: null,
    repo_id: null,
    tokens: null,
    cost_usd: null,
    findings: 0,
    source: "ci" as const,
  },
];

describe("RunHistoryTable", () => {
  it("renders rows, links the PR, and opens/closes the trace drawer", async () => {
    renderWithIntl(<RunHistoryTable runs={runs} agentName="Security" />);
    expect(screen.getByText("2026-06-01 09:14")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "#482" })).toHaveAttribute("href", "/repos/repo-9/pulls/482");
    expect(screen.getByText("16k")).toBeInTheDocument();
    expect(screen.getByText("$0.06")).toBeInTheDocument();
    expect(screen.getByText("local")).toBeInTheDocument();
    expect(screen.getByText("CI")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);

    await user.click(screen.getAllByRole("button", { name: "View trace" })[0]!);
    expect(screen.getByRole("dialog", { name: "trace run-1" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the empty state", () => {
    renderWithIntl(<RunHistoryTable runs={[]} />);
    expect(screen.getByText("No runs yet")).toBeInTheDocument();
  });
});
