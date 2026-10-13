import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { ReindexButton } from "./ReindexButton";

afterEach(cleanup);

describe("ReindexButton", () => {
  it("idle is enabled and fires onClick; running is disabled and relabelled", async () => {
    // Catches: a double-start while a job runs, or the label not switching to "Re-indexing…".
    const onClick = vi.fn();
    const { unmount } = renderWithIntl(<ReindexButton running={false} noClone={false} onClick={onClick} />);
    const btn = screen.getByRole("button", { name: "Re-index" });
    expect(btn).toBeEnabled();
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
    unmount();

    renderWithIntl(<ReindexButton running noClone={false} onClick={onClick} />);
    expect(screen.getByRole("button", { name: "Re-indexing…" })).toBeDisabled();
  });

  it("noClone is disabled with the clone hint as accessible description and title", () => {
    // Catches: re-index offered for an uncloned repo, or the reason not exposed to assistive tech.
    renderWithIntl(<ReindexButton running={false} noClone onClick={vi.fn()} />);
    const btn = screen.getByRole("button", { name: "Re-index" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleDescription("Clone the repository first");
    expect(btn).toHaveAttribute("title", "Clone the repository first");
  });
});
