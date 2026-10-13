import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-intl";
import type { ContextIndexInfo } from "@/lib/types";
import { IndexFooter } from "./IndexFooter";

afterEach(cleanup);

const READY: ContextIndexInfo = {
  status: "ready",
  indexed_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  indexed_sha: "abc",
  files: 12,
  chunks: 1240,
};

// The ToastProvider also renders a role="status" region, so find the footer's by its text.
const live = (text: string) => {
  const el = screen.getByText(text);
  expect(el).toHaveAttribute("role", "status");
  return el;
};

describe("IndexFooter", () => {
  it("ready: counts and relative time are two separate lines; stale appends 'out of date'", () => {
    // Catches: the two lines merged into one string, thousands separator lost, stale flag ignored.
    const { unmount } = renderWithIntl(<IndexFooter index={READY} stale={false} running={false} />);
    expect(screen.getByText("Indexed: 12 files · 1,240 chunks")).toBeInTheDocument();
    expect(live("last 5m ago")).toHaveTextContent(/^last 5m ago$/);
    unmount();

    renderWithIntl(<IndexFooter index={READY} stale running={false} />);
    expect(live("last 5m ago · out of date")).toBeInTheDocument();
  });

  it("none: a single 'Not indexed yet' line; running replaces only line 2", () => {
    // Catches: zero counts shown for a never-indexed repo; running wiping the counts line.
    const none: ContextIndexInfo = { status: "none", indexed_at: null, indexed_sha: null, files: 0, chunks: 0 };
    const first = renderWithIntl(<IndexFooter index={none} stale={false} running={false} />);
    expect(live("Not indexed yet")).toBeInTheDocument();
    expect(screen.queryByText(/Indexed:/)).not.toBeInTheDocument();
    expect(first.container.textContent).toBe("Not indexed yet");
    first.unmount();

    renderWithIntl(<IndexFooter index={{ ...READY, status: "indexing" }} stale={false} running />);
    expect(live("Re-indexing…")).toBeInTheDocument();
    expect(screen.getByText("Indexed: 12 files · 1,240 chunks")).toBeInTheDocument();
    expect(screen.queryByText(/last 5m ago/)).not.toBeInTheDocument();
  });
});
