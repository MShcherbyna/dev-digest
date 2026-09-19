import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-intl";
import { formatCost } from "./helpers";

const useAgentStats = vi.fn();
vi.mock("@/lib/hooks/agents", () => ({ useAgentStats: (id: string) => useAgentStats(id) }));

import { StatsTab } from "./StatsTab";

afterEach(cleanup);

describe("agent StatsTab", () => {
  it("renders tiles, skill links (disabled marked) and categories", () => {
    useAgentStats.mockReturnValue({
      data: {
        runs_30d: 14,
        accept_pct: 55,
        avg_cost_usd: 0.0123,
        findings_30d: 42,
        skills: [
          { id: "sk1", name: "uncovered-branches", enabled: true },
          { id: "sk2", name: "flaky-test-detector", enabled: false },
        ],
        by_category: [
          { category: "bug", count: 7 },
          { category: "test", count: 5 },
        ],
      },
      isLoading: false,
      isError: false,
    });
    renderWithIntl(<StatsTab agentId="ag1" />);
    expect(useAgentStats).toHaveBeenCalledWith("ag1");
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getAllByText("55%").length).toBeGreaterThan(0);
    expect(screen.getByText("$0.012")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "uncovered-branches" })).toHaveAttribute("href", "/skills/sk1");
    expect(screen.getByRole("link", { name: "flaky-test-detector" })).toHaveAttribute("href", "/skills/sk2");
    expect(screen.getAllByText("disabled")).toHaveLength(1);
    expect(screen.getByText("bug")).toBeInTheDocument();
  });

  it("shows em dashes and empty notes when there is no data", () => {
    useAgentStats.mockReturnValue({
      data: { runs_30d: 0, accept_pct: null, avg_cost_usd: null, findings_30d: 0, skills: [], by_category: [] },
      isLoading: false,
      isError: false,
    });
    renderWithIntl(<StatsTab agentId="ag1" />);
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getByText("No skills attached to this agent.")).toBeInTheDocument();
    expect(screen.getByText("No findings yet.")).toBeInTheDocument();
  });

  it("shows an error state", () => {
    useAgentStats.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });
    renderWithIntl(<StatsTab agentId="ag1" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load stats.");
  });
});

describe("formatCost", () => {
  it("formats to 3 decimals and dashes null", () => {
    expect(formatCost(0.5)).toBe("$0.500");
    expect(formatCost(null)).toBe("—");
  });
});
