import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-intl";
import { SeverityWeeklyChart } from "./SeverityWeeklyChart";

afterEach(cleanup);

describe("SeverityWeeklyChart", () => {
  it("renders the severity legend for the weekly series", () => {
    renderWithIntl(
      <SeverityWeeklyChart
        weeks={[
          { week: "w1", CRITICAL: 1, WARNING: 2, SUGGESTION: 3 },
          { week: "w2", CRITICAL: 0, WARNING: 4, SUGGESTION: 1 },
        ]}
      />,
    );
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByText("Suggestion")).toBeInTheDocument();
  });
});
