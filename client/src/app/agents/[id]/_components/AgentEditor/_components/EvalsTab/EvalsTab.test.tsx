import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-intl";
import { EvalsTab } from "./EvalsTab";

afterEach(cleanup);

describe("agent EvalsTab", () => {
  it("shows the coming-soon placeholder", () => {
    renderWithIntl(<EvalsTab />);
    expect(screen.getByText("Evals are coming soon")).toBeInTheDocument();
  });
});
