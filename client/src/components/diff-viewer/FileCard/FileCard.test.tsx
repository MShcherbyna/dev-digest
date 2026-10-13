import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-intl";
import user from "@/test/user";
import type { PrFile } from "@/lib/types";
import { FileCard } from "./FileCard";

// Old lines 1-3 / new lines 1-3: ctx(1) del(old 2) add(new 2) ctx(3)
const PATCH = "@@ -1,3 +1,3 @@\n keep1\n-gone\n+added\n keep3";
const SMALL: PrFile = { path: "src/a.ts", additions: 1, deletions: 1, patch: PATCH };
const BIG: PrFile = { path: "src/big.ts", additions: 150, deletions: 60, patch: PATCH }; // > 200 changed lines

const scroll = vi.fn();

beforeEach(() => {
  // jsdom has no scrollIntoView; FileCard calls it optionally.
  Element.prototype.scrollIntoView = scroll;
});
afterEach(() => {
  cleanup();
  scroll.mockReset();
});

function header(path: string): HTMLElement {
  // path text span → path wrapper span → header div
  return screen.getByText(path).parentElement!.parentElement!;
}

describe("FileCard targeting", () => {
  // Catches: AC-16/AC-26 - a selected file must open (even a big, normally-collapsed one), be
  // outlined, scroll the exact head-side line to the centre and move focus to its header.
  it("selected: opens a big file, outlines it, scrolls to [data-new-line] and focuses the header", () => {
    renderWithIntl(<FileCard file={BIG} selected targetLine={2} />);

    // body is rendered although the file is over the auto-expand limit
    expect(screen.getByText("added")).toBeInTheDocument();

    const line = scroll.mock.contexts[0] as HTMLElement;
    expect(line.getAttribute("data-new-line")).toBe("2");
    expect(line).toHaveTextContent("added");
    expect(scroll).toHaveBeenCalledWith({ block: "center" });
    expect(scroll).toHaveBeenCalledTimes(1);

    const head = header("src/big.ts");
    expect(head).toHaveAttribute("tabindex", "-1");
    expect(head).toHaveFocus();
    // outline = accent border + ring on the card
    expect(head.parentElement!.getAttribute("style")).toContain("var(--accent)");
  });

  // Catches: AC-26 - without a line (or with one that isn't rendered) the HEADER is scrolled to,
  // never a stale/other row.
  it("selected without a rendered line scrolls the header instead", () => {
    const { unmount } = renderWithIntl(<FileCard file={SMALL} selected targetLine={null} />);
    expect((scroll.mock.contexts[0] as HTMLElement).getAttribute("data-new-line")).toBeNull();
    expect(scroll.mock.contexts[0]).toBe(header("src/a.ts"));
    unmount();
    scroll.mockReset();

    renderWithIntl(<FileCard file={SMALL} selected targetLine={999} />);
    expect(scroll.mock.contexts[0]).toBe(header("src/a.ts"));
  });

  // Catches: an unselected card stealing focus/scroll on mount, or a big file auto-opening.
  it("not selected: no scroll, no focus, no outline, a big file stays collapsed and toggles on click", async () => {
    renderWithIntl(<FileCard file={BIG} />);
    expect(scroll).not.toHaveBeenCalled();
    const head = header("src/big.ts");
    expect(head).not.toHaveAttribute("tabindex");
    expect(head).not.toHaveFocus();
    expect(head.parentElement!.getAttribute("style")).not.toContain("var(--accent)");
    expect(screen.queryByText("added")).not.toBeInTheDocument();
    await user.click(head);
    expect(screen.getByText("added")).toBeInTheDocument();
  });
});

describe("CodeLine data-new-line", () => {
  // Catches: the scroll target selector breaking - head-side rows (context + added) must carry
  // their new line number; removed rows (no new number) and hunk headers must not.
  it("is set on context and added rows only, with the new-file number", () => {
    const { container } = renderWithIntl(<FileCard file={SMALL} />);
    const rows = [...container.querySelectorAll("[data-new-line]")];
    expect(rows.map((r) => r.getAttribute("data-new-line"))).toEqual(["1", "2", "3"]);
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("keep1"),
      expect.stringContaining("added"),
      expect.stringContaining("keep3"),
    ]);
    // the removed row exists but is not addressable by a new line number
    expect(screen.getByText("gone")).toBeInTheDocument();
    expect(screen.getByText("gone").closest("[data-new-line]")).toBeNull();
  });
});
