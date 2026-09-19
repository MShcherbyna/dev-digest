import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import type { AgentUsageStats } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render-intl";

const useAgentStats = vi.fn();
vi.mock("@/lib/hooks/agents", () => ({ useAgentStats: (id: string) => useAgentStats(id) }));
vi.mock("@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer", () => ({
  RunTraceDrawer: () => null,
}));

import { StatsTab } from "./StatsTab";

afterEach(cleanup);

const full: AgentUsageStats = {
  runs_30d: 14,
  runs_trend: [1, 2, 3, 2],
  accept_pct: 78,
  avg_cost_usd: 0.0412,
  cost_delta_usd: 0.01,
  avg_duration_ms: 6200,
  findings_30d: 42,
  skill_usage: [
    { id: "sk1", name: "uncovered-branches", enabled: true, pct: 92 },
    { id: "sk2", name: "flaky-test-detector", enabled: false, pct: 30 },
  ],
  memory_usage: [{ label: "Prefer early returns", pct: 64 }],
  severity_weekly: [{ week: "w1", CRITICAL: 1, WARNING: 2, SUGGESTION: 3 }],
  by_category: [
    { category: "bug", count: 7 },
    { category: "test", count: 5 },
  ],
  recent_runs: [
    {
      run_id: "run-1",
      ran_at: new Date(2026, 5, 1, 9, 14).toISOString(),
      pr_number: 482,
      repo_id: "r1",
      tokens: 16000,
      cost_usd: 0.06,
      findings: 3,
      source: "ci",
    },
  ],
};

describe("agent StatsTab", () => {
  it("composes tiles, usage panels, findings charts and run history", () => {
    useAgentStats.mockReturnValue({ data: full, isLoading: false, isError: false });
    renderWithIntl(<StatsTab agentId="ag1" />);
    expect(useAgentStats).toHaveBeenCalledWith("ag1");
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("6.2s")).toBeInTheDocument();
    expect(screen.getByText("uncovered-branches")).toBeInTheDocument();
    expect(screen.getByText("92%")).toBeInTheDocument();
    expect(screen.getByText("Prefer early returns")).toBeInTheDocument();
    expect(screen.getByText("Suggestion")).toBeInTheDocument();
    expect(screen.getByText("bug")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "#482" })).toHaveAttribute("href", "/repos/r1/pulls/482");
    expect(screen.getByText("CI")).toBeInTheDocument();
  });

  it("shows empty states and dashes when there is no data", () => {
    useAgentStats.mockReturnValue({
      data: {
        ...full,
        runs_30d: 0,
        runs_trend: [],
        accept_pct: null,
        avg_cost_usd: null,
        cost_delta_usd: null,
        avg_duration_ms: null,
        skill_usage: [],
        memory_usage: [],
        by_category: [],
        recent_runs: [],
      },
      isLoading: false,
      isError: false,
    });
    renderWithIntl(<StatsTab agentId="ag1" />);
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.getByText("No skills linked yet")).toBeInTheDocument();
    expect(screen.getByText("No memory pulled yet")).toBeInTheDocument();
    expect(screen.getByText("No findings yet.")).toBeInTheDocument();
    expect(screen.getByText("No runs yet")).toBeInTheDocument();
  });

  it("shows an error state", () => {
    useAgentStats.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });
    renderWithIntl(<StatsTab agentId="ag1" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load stats.");
  });
});
