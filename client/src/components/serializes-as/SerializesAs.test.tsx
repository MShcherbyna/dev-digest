import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-intl";
import { SerializesAs } from "./SerializesAs";

describe("SerializesAs", () => {
  it("shows the heading plus one line per attached path, in order", () => {
    // Catches: the box missing on a tab, or the attachment order / heading drifting from the design.
    const { container } = renderWithIntl(<SerializesAs paths={["specs/b.md", "specs/a.md"]} />);
    expect(screen.getByText("Serializes as")).toBeInTheDocument();
    expect(container.querySelector("pre")?.textContent).toBe("## Project specifications\n- specs/b.md\n- specs/a.md");
  });
});
