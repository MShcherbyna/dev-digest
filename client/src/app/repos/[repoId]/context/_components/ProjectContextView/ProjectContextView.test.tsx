import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, within, act } from "@testing-library/react";
import { QueryCache, QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { notify } from "@/lib/toast";
import type { ContextFileInfo, ContextIndexInfo, ContextListing } from "@/lib/types";

const net = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  push: vi.fn(),
}));
const state = vi.hoisted(() => ({
  listing: (() => ({})) as () => unknown,
  notFound: false,
  fullName: "acme/api",
  repos: [{ id: "r1" }] as { id: string }[],
  file: {} as Record<string, { content?: string; status?: number }>,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1" }),
  useRouter: () => ({ push: net.push }),
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
// Mock at the network boundary (the api module) so the real hooks, polling and mutation run.
vi.mock("@/lib/api", async (orig) => {
  const actual = await orig<typeof import("@/lib/api")>();
  return { ...actual, api: { get: net.get, post: net.post } };
});

import { ApiError } from "@/lib/api";
import { ProjectContextView } from "./ProjectContextView";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const f = (path: string, used_by = 0, extra: Partial<ContextFileInfo> = {}): ContextFileInfo => ({
  path,
  type: "specs",
  size: 40,
  tokens: 10,
  too_large: false,
  used_by,
  ...extra,
});
const idx = (over: Partial<ContextIndexInfo> = {}): ContextIndexInfo => ({
  status: "ready",
  indexed_at: minutesAgo(5),
  indexed_sha: "abc",
  files: 3,
  chunks: 12,
  ...over,
});
const mk = (over: Partial<ContextListing> = {}): ContextListing => ({
  glob: "**/{specs,docs,insights}/**/*.md",
  cloned: true,
  truncated: false,
  total: 3,
  stale: false,
  index: idx(),
  files: [f("specs/public-api.md", 2), f("docs/a.md"), f("docs/huge.md", 0, { too_large: true })],
  ...over,
});
const NEVER: ContextListing = mk({
  files: [],
  total: 0,
  index: { status: "none", indexed_at: null, indexed_sha: null, files: 0, chunks: 0 },
});

function renderView() {
  // Mirrors Providers: a mutation error always raises a toast (src/lib/providers.tsx).
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    queryCache: new QueryCache(),
    mutationCache: new MutationCache({ onError: (e) => notify.error(e instanceof Error ? e.message : "Something went wrong") }),
  });
  return renderWithIntl(
    <QueryClientProvider client={qc}>
      <ProjectContextView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.listing = () => mk();
  state.notFound = false;
  state.fullName = "acme/api";
  state.repos = [{ id: "r1" }];
  state.file = {
    "docs/a.md": { content: "# Alpha heading\n\n- first\n- second" },
    "specs/public-api.md": { content: "# Public API\n\nBody." },
    "docs/huge.md": { status: 413 },
  };
  net.get.mockReset();
  net.post.mockReset();
  net.push.mockReset();
  net.get.mockImplementation(async (url: string) => {
    if (url === "/repos/r1/context") return state.listing();
    if (url.startsWith("/repos/r1/context/file?path=")) {
      const path = decodeURIComponent(url.split("path=")[1] ?? "");
      const file = state.file[path];
      if (!file || file.status) throw new ApiError("x", file?.status ?? 404);
      return { path, content: file.content };
    }
    throw new Error(`unexpected GET ${url}`);
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const listCalls = () => net.get.mock.calls.filter(([u]) => u === "/repos/r1/context").length;
const toolbarBtn = () => within(screen.getByRole("toolbar")).getByRole("button");

describe("ProjectContextView", () => {
  it("AC-7/8/10/14: lists docs by path, selects the first, shows footer + Used by + markdown; the toolbar holds exactly one Re-index button", async () => {
    // Catches: unsorted list, no default selection, a file-management control sneaking back in (view-only),
    // a second button in the header toolbar (the old Refresh), wrong footer counts.
    renderView();

    const list = await screen.findByRole("complementary", { name: "Project Context" });
    const names = within(list)
      .getAllByRole("button", { name: /\.md$/ })
      .map((b) => b.getAttribute("title"));
    expect(names).toEqual(["docs/a.md", "docs/huge.md", "specs/public-api.md"]);
    expect(within(list).getByText("acme/api")).toBeInTheDocument();
    expect(within(list).getByText("public-api.md")).toBeInTheDocument();
    expect(within(list).getAllByText("docs/").length).toBe(2);
    expect(within(list).getAllByText("docs").length).toBe(2);
    expect(within(list).getByText("specs")).toBeInTheDocument();
    expect(screen.getByText("Indexed: 3 files · 12 chunks")).toBeInTheDocument();
    expect(screen.getByText("last 5m ago")).toBeInTheDocument();

    // header query scoped to the toolbar (the list rows are buttons too)
    const toolbarButtons = within(screen.getByRole("toolbar")).getAllByRole("button");
    expect(toolbarButtons).toHaveLength(1);
    expect(toolbarButtons[0]).toHaveAccessibleName("Re-index");
    expect(screen.queryByRole("button", { name: /new file|new folder|upload|download|refresh|edit/i })).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: "docs/a.md" })).toHaveAttribute("aria-current", "true");
    expect(await screen.findByRole("heading", { name: "Alpha heading" })).toBeInTheDocument();
    expect(screen.getByText("Used by 0 agents")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "specs/public-api.md" }));
    expect(await screen.findByRole("heading", { name: "Public API" })).toBeInTheDocument();
    expect(screen.getByText("Used by 2 agents")).toBeInTheDocument();
  });

  it("AC-11: a too-large selected document shows the notice instead of content", async () => {
    // Catches: a 413 rendering as a blank/broken panel.
    renderView();
    await userEvent.click(await screen.findByRole("button", { name: "docs/huge.md" }));
    expect(await screen.findByText("This document is too large to preview.")).toBeInTheDocument();
  });

  it("AC-11: a selected document that vanished shows 'not found'", async () => {
    state.file["docs/a.md"] = { status: 404 };
    renderView();
    expect(await screen.findByText("This document was not found in the repository.")).toBeInTheDocument();
  });

  it("AC-11: loading, error (Retry re-requests), empty (names the glob), not-found and no-repo states", async () => {
    // Catches: any of the distinct states collapsing into a blank page.
    state.listing = () => new Promise(() => {});
    const loading = renderView();
    expect(screen.queryByRole("button", { name: /\.md$/ })).not.toBeInTheDocument();
    loading.unmount();

    state.listing = () => {
      throw new Error("boom");
    };
    const err = renderView();
    expect(await screen.findByText("Couldn’t load project context")).toBeInTheDocument();
    const before = listCalls();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    await vi.waitFor(() => expect(listCalls()).toBe(before + 1));
    err.unmount();

    state.listing = () => mk({ files: [], total: 0 });
    const empty = renderView();
    expect(await screen.findByText("No documents found")).toBeInTheDocument();
    expect(screen.getByText(/\*\*\/\{specs,docs,insights\}\/\*\*\/\*\.md/)).toBeInTheDocument();
    empty.unmount();

    state.notFound = true;
    renderView();
    expect(screen.getByText("No repo selected")).toBeInTheDocument();
  });

  it("AC-11: with no repository at all it shows 'Select a repository', not the unknown-id state", () => {
    // Catches: the no-active-repo case reusing the stale-link RepoNotFound copy.
    state.repos = [];
    state.notFound = true;
    renderView();
    expect(screen.getByText("Select a repository to browse its documents.")).toBeInTheDocument();
    expect(screen.queryByText("No repo selected")).not.toBeInTheDocument();
  });

  it("Q4: a long repo name is truncated on one line, with the full owner/name as tooltip and text content", async () => {
    // Catches: a long name wrapping over several lines or clipped with no way to read it.
    const long = "very-long-organisation-name/an-extremely-long-repository-name-that-cannot-fit";
    state.fullName = long;
    renderView();
    const list = await screen.findByRole("complementary", { name: "Project Context" });
    const name = within(list).getByText(long);
    expect(name).toHaveAttribute("title", long);
    expect(name).toHaveStyle({ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
  });

  it("AC-36: the truncation notice shows while truncated, and the footer shows the index counts (not the returned rows)", async () => {
    // Catches: missing notice; footer derived from the (capped) row list instead of the index.
    state.listing = () => mk({ truncated: true, total: 2001, index: idx({ files: 2001, chunks: 9000 }) });
    renderView();
    expect(await screen.findByText("Showing the first 2,000 of 2001 documents.")).toBeInTheDocument();
    expect(screen.getByText("Indexed: 2,001 files · 9,000 chunks")).toBeInTheDocument();
  });
});

describe("ProjectContextView re-index flow", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-10-13T12:00:00Z") });
  });
  // advanceTimersByTimeAsync flushes microtasks + TanStack's zero-delay notify timers.
  const tick = (ms = 10) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  const start = async () => {
    renderView();
    await tick();
  };
  const rows = () => screen.queryAllByRole("button", { name: /\.md$/ }).map((b) => b.getAttribute("title"));
  const footerLine2 = (text: string | RegExp) => screen.getByText(text).closest('[role="status"]');

  it("AC-15: never indexed shows 'Not indexed yet' with a Re-index action, and a single footer line", async () => {
    // Catches: 0-count footer or the generic 'No documents found' for a repo that was never indexed.
    state.listing = () => NEVER;
    await start();
    expect(screen.getAllByText("Not indexed yet")).toHaveLength(2); // list empty state + footer
    expect(screen.queryByText("No documents found")).not.toBeInTheDocument();
    expect(screen.queryByText(/Indexed:/)).not.toBeInTheDocument();
    // exactly one of the two is the footer's live region
    expect(screen.getAllByText("Not indexed yet").filter((el) => el.closest('[role="status"]'))).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Re-index" })).toHaveLength(2); // toolbar + empty-state action
    expect(toolbarBtn()).toBeEnabled();
  });

  it("AC-16: Re-index keeps rows while indexing, then the new file and counts appear, with no toast and no navigation", async () => {
    // Catches: list blanked during the job, polling never picking up the result, a success toast, navigation away.
    let current = mk({ index: idx({ files: 1, chunks: 4 }), files: [f("docs/a.md")], total: 1 });
    state.listing = () => current;
    net.post.mockImplementation(async () => {
      current = { ...current, index: { ...current.index, status: "indexing" } };
      return { status: "accepted", job_id: "j1" };
    });
    await start();
    expect(rows()).toEqual(["docs/a.md"]);
    expect(screen.getByText("last 5m ago")).toBeInTheDocument();

    await userEvent.click(toolbarBtn());
    await tick();
    expect(net.post).toHaveBeenCalledWith("/repos/r1/context/reindex");
    expect(toolbarBtn()).toBeDisabled();
    expect(toolbarBtn()).toHaveAccessibleName("Re-indexing…");
    expect(rows()).toEqual(["docs/a.md"]);
    expect(screen.getByText("Indexed: 1 file · 4 chunks")).toBeInTheDocument();
    expect(footerLine2("Re-indexing…")).not.toBeNull();

    current = mk({ index: idx({ files: 2, chunks: 9, indexed_at: new Date().toISOString() }), files: [f("docs/a.md"), f("docs/b.md")], total: 2 });
    await tick(2000);
    expect(rows()).toEqual(["docs/a.md", "docs/b.md"]);
    expect(screen.getByText("Indexed: 2 files · 9 chunks")).toBeInTheDocument();
    expect(screen.getByText("last just now")).toBeInTheDocument();
    expect(toolbarBtn()).toBeEnabled();
    expect(toolbarBtn()).toHaveAccessibleName("Re-index");
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument(); // no toast at all
    expect(net.push).not.toHaveBeenCalled();
  });

  it.each([
    ["409 response", new ApiError("Re-index already running", 409)],
    ["503 response", new ApiError("Service unavailable", 503)],
    ["network error", new ApiError("Network error", 0)],
  ])("AC-17: a %s toasts, keeps the footer and leaves the button enabled", async (_n, error) => {
    // Catches: a rejected POST leaving the button stuck disabled/spinning, or failing silently.
    net.post.mockRejectedValue(error);
    await start();
    await userEvent.click(toolbarBtn());
    await tick();
    expect(screen.getByText((error as ApiError).message)).toBeInTheDocument();
    expect(screen.getByText("Indexed: 3 files · 12 chunks")).toBeInTheDocument();
    expect(screen.getByText("last 5m ago")).toBeInTheDocument();
    expect(toolbarBtn()).toBeEnabled();
    expect(toolbarBtn()).toHaveAccessibleName("Re-index");
  });

  it("AC-17: a job that ends 'failed' toasts once, keeps the previous index text and re-enables the button", async () => {
    // Catches: a failed job being reported as success or never ending the waiting state.
    let current = mk();
    state.listing = () => current;
    net.post.mockImplementation(async () => {
      current = { ...current, index: { ...current.index, status: "indexing" } };
      return { status: "accepted", job_id: "j1" };
    });
    await start();
    await userEvent.click(toolbarBtn());
    await tick();
    expect(toolbarBtn()).toBeDisabled();

    current = mk({ index: idx({ status: "failed", failed_at: new Date().toISOString(), failure_reason: "internal_error" }) });
    await tick(2000);
    expect(screen.getAllByText("Re-index failed. The previous index is kept.")).toHaveLength(1);
    expect(screen.getByText("Indexed: 3 files · 12 chunks")).toBeInTheDocument();
    expect(screen.getByText("last 5m ago")).toBeInTheDocument();
    expect(toolbarBtn()).toBeEnabled();
  });

  it("AC-17: status still 'indexing' after 150 s gives up with a toast and re-enables the button", async () => {
    // Catches: an infinite spinner when the server never finishes; the give-up must not clear the shown index.
    let current = mk();
    state.listing = () => current;
    net.post.mockImplementation(async () => {
      current = { ...current, index: { ...current.index, status: "indexing" } };
      return { status: "accepted", job_id: "j1" };
    });
    await start();
    await userEvent.click(toolbarBtn());
    await tick();
    await tick(140_000);
    expect(toolbarBtn()).toBeDisabled();
    expect(screen.queryByText(/taking too long/)).not.toBeInTheDocument();

    await tick(10_000);
    expect(screen.getByText("Re-index is taking too long. The previous index is kept.")).toBeInTheDocument();
    expect(toolbarBtn()).toBeEnabled();
    expect(rows()).toHaveLength(3);
    expect(screen.getByText("Indexed: 3 files · 12 chunks")).toBeInTheDocument();
  });

  it("AC-18: a failed poll with data present keeps the rows (no ErrorState) and the flow recovers on the next good poll", async () => {
    // Catches: a transient poll error replacing the list with the full-page ErrorState.
    let current = mk({ files: [f("docs/a.md")], total: 1, index: idx({ files: 1, chunks: 4 }) });
    let failing = false;
    state.listing = () => {
      if (failing) throw new ApiError("Server exploded", 500);
      return current;
    };
    net.post.mockImplementation(async () => {
      current = { ...current, index: { ...current.index, status: "indexing" } };
      return { status: "accepted", job_id: "j1" };
    });
    await start();
    await userEvent.click(toolbarBtn());
    await tick();
    expect(toolbarBtn()).toBeDisabled();

    failing = true;
    await tick(2000);
    expect(screen.queryByText("Couldn’t load project context")).not.toBeInTheDocument();
    expect(rows()).toEqual(["docs/a.md"]);

    failing = false;
    current = mk({ files: [f("docs/a.md"), f("docs/b.md")], total: 2, index: idx({ files: 2, chunks: 9, indexed_at: new Date().toISOString() }) });
    await tick(2000);
    expect(rows()).toEqual(["docs/a.md", "docs/b.md"]);
    expect(toolbarBtn()).toBeEnabled();
  });

  it("AC-19: an uncloned repository has a disabled button with the hint and the not-cloned empty state", async () => {
    // Catches: re-index offered for a repo with no clone; the not-cloned state masked by 'Not indexed yet'.
    state.listing = () => mk({ cloned: false, files: [], total: 0, index: NEVER.index });
    await start();
    expect(toolbarBtn()).toBeDisabled();
    expect(toolbarBtn()).toHaveAccessibleDescription("Clone the repository first");
    expect(screen.getByText("Repository not cloned")).toBeInTheDocument();
    expect(screen.queryByText("Not indexed yet")).not.toBeInTheDocument();
  });
});
