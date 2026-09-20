import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { UsageBars } from "./UsageBars";

afterEach(cleanup);

describe("UsageBars", () => {
  it("renders label and percent per row and dims flagged rows", () => {
    render(
      <UsageBars
        color="var(--accent)"
        mono
        emptyLabel="No skills linked yet"
        rows={[
          { key: "a", label: "uncovered-branches", pct: 92 },
          { key: "b", label: "flaky-test-detector", pct: 40.4, dim: true },
        ]}
      />,
    );
    expect(screen.getByText("uncovered-branches")).toBeInTheDocument();
    expect(screen.getByText("92%")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByText("flaky-test-detector").closest("li")).toHaveStyle({ opacity: "0.45" });
    expect(screen.getByText("uncovered-branches").closest("li")).toHaveStyle({ opacity: "1" });
    expect(screen.queryByText("No skills linked yet")).not.toBeInTheDocument();
  });

  it("shows the empty label when there are no rows", () => {
    render(<UsageBars rows={[]} color="#a78bfa" emptyLabel="No memory pulled yet" />);
    expect(screen.getByText("No memory pulled yet")).toBeInTheDocument();
  });
});
