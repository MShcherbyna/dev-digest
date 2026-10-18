import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { TargetStep } from "./TargetStep";

afterEach(cleanup);

describe("TargetStep", () => {
  it("GitHub Actions is selected; the stub cards are disabled and cannot be picked (AC-3)", async () => {
    const onTarget = vi.fn();
    renderWithIntl(<TargetStep target="gha" onTarget={onTarget} />);
    expect(screen.getByRole("radio", { name: /GitHub Actions/ })).toBeChecked();
    for (const name of [/CircleCI/, /Jenkins/, /Generic CLI/]) {
      const r = screen.getByRole("radio", { name });
      expect(r).toBeDisabled();
      expect(r).toHaveAttribute("aria-disabled", "true");
      await userEvent.click(r);
    }
    expect(onTarget).not.toHaveBeenCalled();
    expect(screen.getAllByText("Coming soon")).toHaveLength(3);
  });
});
