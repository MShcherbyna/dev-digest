import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-intl";

const useSkillStats = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({ useSkillStats: (id: string) => useSkillStats(id) }));

import { StatsTab } from "./StatsTab";

afterEach(cleanup);

describe("StatsTab", () => {
  it("renders tiles, agent links and categories", () => {
    useSkillStats.mockReturnValue({
      data: {
        used_by: 2,
        pull_pct: 80,
        accept_pct: 55,
        findings_30d: 12,
        agents: [{ id: "ag1", name: "Security Reviewer" }],
        by_category: [
          { category: "bug", count: 7 },
          { category: "test", count: 5 },
        ],
      },
      isLoading: false,
      isError: false,
    });
    renderWithIntl(<StatsTab skillId="sk1" />);
    expect(screen.getByText("80")).toBeInTheDocument();
    expect(screen.getAllByText("55").length).toBeGreaterThan(0);
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("agents")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Security Reviewer/ })).toHaveAttribute("href", "/agents/ag1");
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("bug")).toBeInTheDocument();
  });

  it("shows em dashes and empty notes when there is no data", () => {
    useSkillStats.mockReturnValue({
      data: { used_by: 0, pull_pct: null, accept_pct: null, findings_30d: 0, agents: [], by_category: [] },
      isLoading: false,
      isError: false,
    });
    renderWithIntl(<StatsTab skillId="sk1" />);
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getByText("No agent uses this skill yet.")).toBeInTheDocument();
    expect(screen.getByText("No findings yet.")).toBeInTheDocument();
  });

  it("shows an error state", () => {
    useSkillStats.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });
    renderWithIntl(<StatsTab skillId="sk1" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load stats.");
  });
});
