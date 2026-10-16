import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { AccessibleModal } from "./AccessibleModal";

afterEach(cleanup);

function Harness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>opener</button>
      {open && (
        <AccessibleModal
          title="Eval case"
          footer={<button>footer-action</button>}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        >
          <input aria-label="field" />
        </AccessibleModal>
      )}
    </>
  );
}

/** Opens on "opener" click; `mode` picks what `returnFocusTo` points at. */
function ReturnHarness({ mode }: { mode: "none" | "target" | "detached" | "empty" }) {
  const [open, setOpen] = React.useState(false);
  const target = React.useRef<HTMLButtonElement>(null);
  const detached = React.useRef<HTMLElement | null>(null);
  const empty = React.useRef<HTMLElement | null>(null);
  const ref = mode === "target" ? target : mode === "detached" ? detached : mode === "empty" ? empty : undefined;
  return (
    <>
      <button onClick={() => setOpen(true)}>opener</button>
      <button ref={target}>trigger</button>
      <button
        onClick={() => {
          detached.current = document.createElement("button"); // never attached to the document
        }}
      >
        detach
      </button>
      {open && (
        <AccessibleModal title="Later" returnFocusTo={ref} onClose={() => setOpen(false)}>
          <input aria-label="field" />
        </AccessibleModal>
      )}
    </>
  );
}

describe("AccessibleModal returnFocusTo", () => {
  it("returns focus to returnFocusTo.current instead of the mount-time active element", async () => {
    // Catches (B-3): a modal that mounts after an async step restoring focus to <body>/the
    // blurred opener. Pre-fix the hook only read document.activeElement at mount ("opener").
    renderWithIntl(<ReturnHarness mode="target" />);
    const opener = screen.getByText("opener");
    opener.focus();
    await userEvent.click(opener);
    expect(screen.getByRole("dialog", { name: "Later" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("trigger")).toHaveFocus();
    expect(opener).not.toHaveFocus();
  });

  it("falls back to the mount-time opener without the prop, with an unset ref, or a disconnected element", async () => {
    // Catches: the new prop breaking the default behaviour, or a null / detached ref
    // swallowing the restore (focus would be lost to <body>).
    for (const mode of ["none", "empty", "detached"] as const) {
      renderWithIntl(<ReturnHarness mode={mode} />);
      if (mode === "detached") await userEvent.click(screen.getByText("detach"));
      const opener = screen.getByText("opener");
      opener.focus();
      await userEvent.click(opener);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(opener).toHaveFocus();
      cleanup();
    }
  });
});

describe("AccessibleModal", () => {
  it("labels the dialog by its title, traps Tab inside, closes on Escape and returns focus to the opener", async () => {
    // Catches: dialog without an accessible name, focus escaping behind the modal,
    // Escape not closing, and focus lost after close (R4 / a11y NFR).
    const onClose = vi.fn();
    renderWithIntl(<Harness onClose={onClose} />);
    const opener = screen.getByText("opener");
    opener.focus();
    await userEvent.click(opener);

    const dialog = screen.getByRole("dialog", { name: "Eval case" });
    expect(dialog.contains(document.activeElement)).toBe(true);

    // Tab from the last focusable wraps to the first; Shift+Tab from the first wraps to the last.
    const footer = screen.getByRole("button", { name: "footer-action" });
    footer.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(footer);
    const first = document.activeElement as HTMLElement;
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(footer);
    expect(first).not.toBe(footer);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
