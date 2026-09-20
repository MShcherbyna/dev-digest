import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-intl";
import { SKILL } from "@/test/fixtures";
import { PreviewTab } from "./PreviewTab";
import { buildPromptBlock } from "./helpers";

afterEach(cleanup);

describe("PreviewTab", () => {
  it("renders the markdown and the exact prompt block", () => {
    renderWithIntl(<PreviewTab skill={SKILL} />);
    expect(screen.getByText("Rule", { selector: "h1" })).toBeInTheDocument();
    expect(screen.getByTestId("prompt-block").textContent).toBe(buildPromptBlock(SKILL));
    expect(screen.queryByText(/not manual/)).not.toBeInTheDocument();
  });

  it("flags non-manual skills as untrusted", () => {
    renderWithIntl(<PreviewTab skill={{ ...SKILL, source: "imported_url" }} />);
    expect(screen.getByText(/wrapped as untrusted data/)).toBeInTheDocument();
  });
});
