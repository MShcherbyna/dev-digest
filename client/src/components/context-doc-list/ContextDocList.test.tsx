import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within } from "@testing-library/react";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import type { ContextListing } from "@/lib/types";

const state = vi.hoisted(() => ({
  listing: { data: undefined, isLoading: false, isError: false } as {
    data?: unknown;
    isLoading: boolean;
    isError: boolean;
  },
  refetch: vi.fn(),
  file: {} as Record<string, { data?: { content: string }; isLoading?: boolean; isError?: boolean; status?: number }>,
}));

vi.mock("@/lib/hooks/project-context", async () => {
  const { ApiError } = await import("@/lib/api");
  return {
    // Like the real hook: disabled (no data) without a repo id.
    useProjectContext: (repoId?: string | null) => ({
      ...(repoId ? state.listing : { data: undefined, isLoading: false, isError: false }),
      refetch: state.refetch,
    }),
    useContextFile: (_repo: string, path: string) => {
      const f = state.file[path] ?? { isLoading: true };
      return {
        data: f.data,
        isLoading: !!f.isLoading,
        isError: !!f.isError,
        error: f.status ? new ApiError("x", f.status) : null,
        refetch: vi.fn(),
      };
    },
  };
});

import { ContextDocList } from "./ContextDocList";

const file = (path: string, type: "specs" | "docs" | "insights", tokens: number, extra = {}) => ({
  path,
  type,
  size: tokens * 4,
  tokens,
  too_large: false,
  used_by: 0,
  ...extra,
});

const LISTING: ContextListing = {
  glob: "**/{specs,docs,insights}/**/*.md",
  scanned_at: "2026-10-11T10:00:00Z",
  cloned: true,
  truncated: false,
  total: 5,
  files: [
    file("specs/a.md", "specs", 10),
    file("specs/b.md", "specs", 20),
    file("docs/api.md", "docs", 5),
    file("docs/huge.md", "docs", 700000, { too_large: true }),
    file("insights/z.md", "insights", 1),
  ],
};
const REPO = { id: "r1", name: "acme/api" };

const onChange = vi.fn();
const rowPaths = () =>
  screen
    .getAllByRole("listitem")
    .map((li) => within(li).getByRole("checkbox").getAttribute("aria-label")!.replace("Attach ", ""));

function renderList(props: Partial<React.ComponentProps<typeof ContextDocList>> = {}) {
  return renderWithIntl(
    <ContextDocList
      repo={REPO}
      attached={[]}
      onChange={onChange}
      title="Project context"
      hint="Order matters"
      variant="agent"
      {...props}
    />,
  );
}

beforeEach(() => {
  onChange.mockReset();
  state.listing = { data: LISTING, isLoading: false, isError: false };
  state.file = {};
});
afterEach(cleanup);

describe("ContextDocList", () => {
  it("lists attached rows first in order, then the rest by path; marks not-found and too-large; sums only usable attached tokens", () => {
    // Catches: wrong row order (AC-13), token sum counting not-found / too-large rows (AC-17),
    // missing text markers (colour-only), missing accessible names (AC-16).
    renderList({ attached: ["specs/b.md", "gone/x.md", "docs/huge.md"] });

    expect(rowPaths()).toEqual([
      "specs/b.md",
      "gone/x.md",
      "docs/huge.md",
      "docs/api.md",
      "insights/z.md",
      "specs/a.md",
    ]);
    expect(screen.getByText("3 of 6 attached")).toBeInTheDocument();
    expect(screen.getByText("not found in acme/api")).toBeInTheDocument();
    expect(screen.getByText("too large")).toBeInTheDocument();
    // AC-17: the too-large row shows its own estimate next to the marker; not-found rows show none; the footer sum ignores it.
    expect(screen.getByText("≈ 700000 tokens")).toBeInTheDocument();
    expect(screen.getByText("≈ 20 tokens")).toBeInTheDocument();
    expect(screen.getAllByText(/tokens$/)).toHaveLength(2);
    expect(screen.getByText("insights")).toBeInTheDocument();

    // every control carries the path in its accessible name
    expect(screen.getByRole("checkbox", { name: "Attach specs/b.md" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Attach specs/a.md" })).not.toBeChecked();
    expect(screen.getByRole("img", { name: "Drag to reorder specs/b.md" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview specs/b.md" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move specs/b.md down" })).toBeInTheDocument();
    // a not-found row cannot be previewed but can still be detached
    expect(screen.queryByRole("button", { name: "Preview gone/x.md" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Attach gone/x.md" })).toBeChecked();
  });

  it("emits the full new ordered list: check appends, uncheck removes, keyboard move and drop reorder", async () => {
    // Catches: partial patches (spec: always a full ordered list), append-at-front, broken keyboard alternative (AC-14/15/16).
    renderList({ attached: ["specs/a.md", "specs/b.md"] });

    await userEvent.click(screen.getByRole("checkbox", { name: "Attach docs/api.md" }));
    expect(onChange).toHaveBeenLastCalledWith(["specs/a.md", "specs/b.md", "docs/api.md"]);

    await userEvent.click(screen.getByRole("checkbox", { name: "Attach specs/a.md" }));
    expect(onChange).toHaveBeenLastCalledWith(["specs/b.md"]);

    await userEvent.click(screen.getByRole("button", { name: "Move specs/b.md up" }));
    expect(onChange).toHaveBeenLastCalledWith(["specs/b.md", "specs/a.md"]);
    // the first attached row cannot move up, the last cannot move down
    expect(screen.getByRole("button", { name: "Move specs/a.md up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move specs/b.md down" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move specs/a.md down" })).toBeEnabled();

    const items = screen.getAllByRole("listitem");
    const dataTransfer = { setData: vi.fn(), effectAllowed: "" };
    fireEvent.dragStart(items[1]!, { dataTransfer });
    fireEvent.dragOver(items[0]!, { dataTransfer });
    fireEvent.drop(items[0]!, { dataTransfer });
    expect(onChange).toHaveBeenLastCalledWith(["specs/b.md", "specs/a.md"]);
  });

  it("AC-19: filtering is case-insensitive on the path and disables drag and move", async () => {
    // Catches: a filtered subset being reordered and scrambling the hidden order.
    renderList({ attached: ["specs/a.md", "specs/b.md"] });
    expect(screen.getAllByRole("button", { name: /^Move specs\/.* up$/ })).toHaveLength(2);

    await userEvent.type(screen.getByRole("textbox", { name: "Filter documents…" }), "API");
    expect(rowPaths()).toEqual(["docs/api.md"]);
    expect(screen.queryByRole("button", { name: /^Move / })).not.toBeInTheDocument();

    await userEvent.clear(screen.getByRole("textbox", { name: "Filter documents…" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Filter documents…" }), "specs/a");
    const row = screen.getByRole("listitem");
    expect(row).toHaveAttribute("draggable", "false");
    expect(screen.queryByRole("button", { name: /^Move / })).not.toBeInTheDocument();

    await userEvent.clear(screen.getByRole("textbox", { name: "Filter documents…" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Filter documents…" }), "zzz");
    expect(screen.getByText("No documents match your filter.")).toBeInTheDocument();
  });

  it("AC-20: with no repo it shows only the hint, no rows and no toggles, even with attached paths", () => {
    // Catches: another repo's attached paths leaking into a no-repo view as phantom rows.
    renderList({ repo: null, attached: ["specs/a.md", "specs/b.md"] });
    expect(screen.getByText("Select a repository to browse its documents.")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("Q1: an uncloned repo lists its attached paths as 'not found in <repo>' and they can still be detached", async () => {
    // Catches: attached docs becoming undetachable when the active repo is not cloned.
    state.listing = { data: { ...LISTING, cloned: false, files: [], total: 0 }, isLoading: false, isError: false };
    renderList({ attached: ["specs/a.md", "specs/b.md"] });
    expect(screen.getByText(/acme\/api is not cloned yet/)).toBeInTheDocument();
    expect(rowPaths()).toEqual(["specs/a.md", "specs/b.md"]);
    expect(screen.getAllByText("not found in acme/api")).toHaveLength(2);
    await userEvent.click(screen.getByRole("checkbox", { name: "Attach specs/b.md" }));
    expect(onChange).toHaveBeenLastCalledWith(["specs/a.md"]);
  });

  it("AC-36: shows the 'first 2,000' notice while the listing is truncated", () => {
    // Catches: silently hiding documents beyond the cap.
    state.listing = { data: { ...LISTING, truncated: true, total: 2500 }, isLoading: false, isError: false };
    renderList();
    expect(screen.getByText("Showing the first 2,000 of 2500 documents.")).toBeInTheDocument();
  });

  it("shows an error state with Retry when discovery fails", async () => {
    state.listing = { data: undefined, isLoading: false, isError: true };
    renderList();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(state.refetch).toHaveBeenCalled();
  });

  it("AC-18: Preview opens a read-only rendered modal; a too-large doc shows the notice; Escape closes", async () => {
    // Catches: raw markdown shown instead of rendered, 413 surfacing as a generic error, modal not closing on Escape.
    state.file["specs/a.md"] = { data: { content: "# Rule one\n\n- item" } };
    state.file["docs/huge.md"] = { isError: true, status: 413 };
    renderList();

    await userEvent.click(screen.getByRole("button", { name: "Preview specs/a.md" }));
    expect(await screen.findByRole("heading", { name: "Rule one" })).toBeInTheDocument();
    expect(screen.getByText("item")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("heading", { name: "Rule one" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Preview docs/huge.md" }));
    expect(await screen.findByText("This document is too large to preview.")).toBeInTheDocument();
  });
});
