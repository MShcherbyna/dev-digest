import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CategoryDonut } from "./CategoryDonut";

afterEach(cleanup);

describe("CategoryDonut", () => {
  it("lists non-zero categories with their counts in the legend", () => {
    render(
      <CategoryDonut
        categories={[
          { category: "bug", count: 7 },
          { category: "style", count: 0 },
          { category: "test", count: 5 },
        ]}
      />,
    );
    expect(screen.getByText("bug")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("test")).toBeInTheDocument();
    expect(screen.queryByText("style")).not.toBeInTheDocument();
  });
});
