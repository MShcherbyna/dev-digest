import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";

vi.mock("@/lib/hooks/project-context", () => ({
  useContextFile: () => ({
    data: { content: "# Title\n\n[a link](https://example.com)" },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

import { DocPreviewModal } from "./DocPreviewModal";

function Harness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>opener</button>
      <button>outside</button>
      {open && (
        <DocPreviewModal
          repoId="r1"
          path="docs/a.md"
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

afterEach(cleanup);

describe("DocPreviewModal focus management", () => {
  it("moves focus into the dialog, cycles Tab/Shift+Tab inside it, closes on Escape and restores focus to the opener", async () => {
    // Catches: focus escaping behind the modal (a11y NFR), no initial focus, focus lost after close.
    const onClose = vi.fn();
    renderWithIntl(<Harness onClose={onClose} />);
    const opener = screen.getByText("opener");
    opener.focus();
    await userEvent.click(opener);

    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);

    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>("button, a[href]"));
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    expect(first).toHaveFocus();

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();

    // focus that drifted outside the dialog is pulled back in
    screen.getByText("outside").focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
