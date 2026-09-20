import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-intl";
import { StatTiles, type StatTilesProps } from "./StatTiles";

afterEach(cleanup);

const base: StatTilesProps = {
  runs_30d: 128,
  runs_trend: [1, 3, 2, 5],
  avg_cost_usd: 0.0412,
  cost_delta_usd: 0.012,
  avg_duration_ms: 6200,
  accept_pct: 78,
};

describe("StatTiles", () => {
  it("renders the four tiles with a red delta chip when cost rose", () => {
    renderWithIntl(<StatTiles {...base} />);
    expect(screen.getByText("128")).toBeInTheDocument();
    expect(screen.getByText("$0.04")).toBeInTheDocument();
    expect(screen.getByText("+$0.01")).toHaveStyle({ color: "var(--crit)" });
    expect(screen.getByText("6.2s")).toBeInTheDocument();
    expect(screen.getByText("78%")).toBeInTheDocument();
  });

  it("shows a green chip on decrease, hides it when null, and dashes missing values", () => {
    const first = renderWithIntl(<StatTiles {...base} cost_delta_usd={-0.02} />);
    expect(screen.getByText("-$0.02")).toHaveStyle({ color: "var(--ok)" });
    first.unmount();

    renderWithIntl(
      <StatTiles {...base} cost_delta_usd={null} avg_cost_usd={null} avg_duration_ms={null} accept_pct={null} />,
    );
    expect(screen.queryByText(/^[+-]\$/)).not.toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(3);
  });
});
