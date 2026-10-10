import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import type { ContextListing } from "@/lib/types";

const state = vi.hoisted(() => ({
  listing: {} as { data?: unknown; isLoading?: boolean; isError?: boolean; error?: unknown },
  refetch: vi.fn(),
  notFound: false,
  fullName: "acme/api",
  repos: [{ id: "r1" }] as { id: string }[],
  file: {} as Record<string, { data?: { content: string }; status?: number }>,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1" }),
  useRouter: () => ({ push: vi.fn() }),
}));
// AppShell pulls in the whole sidebar/repo stack; the page body is what is under test.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    activeRepo: state.repos.length ? { id: "r1", full_name: state.fullName } : null,
    repos: state.repos,
    reposLoaded: true,
  }),
  useRepoNotFound: () => state.notFound,
}));
vi.mock("@/lib/hooks/project-context", async () => {
  const { ApiError } = await import("@/lib/api");
  return {
    useProjectContext: () => ({ ...state.listing, refetch: state.refetch }),
    useContextFile: (_repo: string, path: string) => {
      const f = state.file[path];
      return {
        data: f?.data,
        isLoading: !f,
        isError: !!f?.status,
        error: f?.status ? new ApiError("x", f.status) : null,
        refetch: vi.fn(),
      };
    },
  };
});

import { ProjectContextView } from "./ProjectContextView";

const f = (path: string, used_by: number, extra = {}) => ({
  path,
  type: "specs" as const,
  size: 40,
  tokens: 10,
  too_large: false,
  used_by,
  ...extra,
});
const LISTING: ContextListing = {
  glob: "**/{specs,docs,insights}/**/*.md",
  scanned_at: new Date().toISOString(),
  cloned: true,
  truncated: false,
  total: 3,
  files: [f("specs/public-api.md", 2), f("docs/a.md", 0), f("docs/huge.md", 0, { too_large: true })],
};

beforeEach(() => {
  state.listing = { data: LISTING, isLoading: false, isError: false };
  state.notFound = false;
  state.fullName = "acme/api";
  state.repos = [{ id: "r1" }];
  state.file = {
    "docs/a.md": { data: { content: "# Alpha heading\n\n- first\n- second" } },
    "specs/public-api.md": { data: { content: "# Public API\n\nBody." } },
    "docs/huge.md": { status: 413 },
  };
  state.refetch.mockReset();
});
afterEach(cleanup);

describe("ProjectContextView", () => {
  it("AC-7/8/10: lists docs by path, selects the first, shows footer + Used by + rendered markdown, and has no edit/add/upload controls; refresh re-requests", async () => {
    // Catches: unsorted list, no default selection, an Edit/Add/Upload control sneaking in (view-only decision), dead refresh.
    renderWithIntl(<ProjectContextView />);

    const list = screen.getByRole("complementary", { name: "Project Context" });
    const names = within(list)
      .getAllByRole("button", { name: /\.md$/ })
      .map((b) => b.getAttribute("title"));
    expect(names).toEqual(["docs/a.md", "docs/huge.md", "specs/public-api.md"]);
    // header shows the repo name (new design), each row a file name, its directory and an area badge
    expect(within(list).getByText("acme/api")).toBeInTheDocument();
    expect(within(list).getByText("public-api.md")).toBeInTheDocument();
    expect(within(list).getAllByText("docs/").length).toBe(2);
    expect(within(list).getAllByText("docs").length).toBe(2);
    expect(within(list).getByText("specs")).toBeInTheDocument();
    expect(screen.getByText("Indexed: 3 files")).toBeInTheDocument();
    expect(screen.getByText(/last scanned/)).toBeInTheDocument();

    // first document selected by default
    expect(screen.getByRole("button", { name: "docs/a.md" })).toHaveAttribute("aria-current", "true");
    expect(await screen.findByRole("heading", { name: "Alpha heading" })).toBeInTheDocument();
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("Used by 0 agents")).toBeInTheDocument();

    // selecting another doc updates the right panel
    await userEvent.click(screen.getByRole("button", { name: "specs/public-api.md" }));
    expect(await screen.findByRole("heading", { name: "Public API" })).toBeInTheDocument();
    expect(screen.getByText("Used by 2 agents")).toBeInTheDocument();

    // view-only: no Edit toggle, no add file / folder / upload
    expect(screen.queryByRole("button", { name: /edit|new file|new folder|add|upload/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/^edit$/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(state.refetch).toHaveBeenCalledTimes(1);
  });

  it("AC-11: a too-large selected document shows the notice instead of content", async () => {
    // Catches: a 413 rendering as a blank/broken panel.
    renderWithIntl(<ProjectContextView />);
    await userEvent.click(screen.getByRole("button", { name: "docs/huge.md" }));
    expect(await screen.findByText("This document is too large to preview.")).toBeInTheDocument();
  });

  it("AC-11: a selected document that vanished shows 'not found'", async () => {
    state.file["docs/a.md"] = { status: 404 };
    renderWithIntl(<ProjectContextView />);
    expect(await screen.findByText("This document was not found in the repository.")).toBeInTheDocument();
  });

  it("AC-11: loading, error (Retry re-requests), not-cloned, empty (names the glob) and no-repo states", async () => {
    // Catches: any of the distinct states collapsing into a blank page.
    state.listing = { isLoading: true };
    const loading = renderWithIntl(<ProjectContextView />);
    expect(screen.queryByRole("button", { name: /\.md$/ })).not.toBeInTheDocument();
    loading.unmount();

    state.listing = { isLoading: false, isError: true, error: new Error("boom") };
    const err = renderWithIntl(<ProjectContextView />);
    expect(screen.getByText("Couldn’t load project context")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(state.refetch).toHaveBeenCalledTimes(1);
    err.unmount();

    state.listing = { data: { ...LISTING, cloned: false, files: [], total: 0 }, isLoading: false };
    const nc = renderWithIntl(<ProjectContextView />);
    expect(screen.getByText("Repository not cloned")).toBeInTheDocument();
    expect(screen.getByText(/acme\/api has no local clone yet/)).toBeInTheDocument();
    nc.unmount();

    state.listing = { data: { ...LISTING, files: [], total: 0 }, isLoading: false };
    const empty = renderWithIntl(<ProjectContextView />);
    expect(screen.getByText("No documents found")).toBeInTheDocument();
    expect(screen.getByText(/\*\*\/\{specs,docs,insights\}\/\*\*\/\*\.md/)).toBeInTheDocument();
    empty.unmount();

    state.notFound = true;
    renderWithIntl(<ProjectContextView />);
    expect(screen.getByText("No repo selected")).toBeInTheDocument();
    expect(screen.queryByText("Select a repository to browse its documents.")).not.toBeInTheDocument();
  });

  it("AC-11: with no repository at all it shows 'Select a repository', not the unknown-id state", () => {
    // Catches: the no-active-repo case reusing the stale-link RepoNotFound copy.
    state.repos = [];
    state.notFound = true;
    renderWithIntl(<ProjectContextView />);
    expect(screen.getByText("Select a repository to browse its documents.")).toBeInTheDocument();
    expect(screen.queryByText("No repo selected")).not.toBeInTheDocument();
  });

  it("Q4: a long repo name is truncated on one line, with the full owner/name as tooltip and text content", () => {
    // Catches: a long name wrapping over several lines (or being clipped with no way to read it):
    // single-line ellipsis styles lost, or the tooltip / full text dropped.
    const long = "very-long-organisation-name/an-extremely-long-repository-name-that-cannot-fit";
    state.fullName = long;
    renderWithIntl(<ProjectContextView />);
    const list = screen.getByRole("complementary", { name: "Project Context" });
    const name = within(list).getByText(long);
    expect(name).toHaveAttribute("title", long);
    expect(name).toHaveStyle({ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
  });

  it("AC-36: the footer counts the returned files and the notice shows while truncated", () => {
    // Catches: footer showing the total instead of the returned count; missing notice.
    state.listing = { data: { ...LISTING, truncated: true, total: 2001 }, isLoading: false };
    renderWithIntl(<ProjectContextView />);
    expect(screen.getByText("Indexed: 3 files")).toBeInTheDocument();
    expect(screen.getByText("Showing the first 2,000 of 2001 documents.")).toBeInTheDocument();
  });
});
