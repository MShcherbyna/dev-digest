/* PR detail page: deep-link wiring for the PR Brief (AC-26/AC-39). The page's children are
   stubbed to the few props that matter; hooks, router and search params are the boundaries. */
import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const h = vi.hoisted(() => ({
  search: "",
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo1", number: "482" }),
  useSearchParams: () => new URLSearchParams(h.search),
  useRouter: () => ({ push: h.push, replace: h.replace }),
}));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/repo-not-found", () => ({ RepoNotFound: () => null }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "acme/repo" } }),
  useRepoNotFound: () => false,
}));
vi.mock("@/lib/hooks", () => ({
  usePulls: () => ({ data: [{ id: "pr1", number: 482 }], isLoading: false }),
  usePullDetail: () => ({
    data: {
      number: 482,
      body: "",
      head_sha: "sha1",
      status: "open",
      files_count: 2,
      files: [{ path: "src/a.ts" }, { path: "src/b.ts" }],
      commits: [],
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/lib/hooks/intent", () => ({ useInvalidateIntent: () => vi.fn() }));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: [], refetch: vi.fn() }),
  useCancelRun: () => ({}),
  usePrActiveRuns: () => ({ data: [] }),
  usePrRuns: () => ({ data: [] }),
  useDeleteRun: () => ({ mutate: vi.fn() }),
}));

vi.mock("./_components/PrDetailHeader", () => ({
  PrDetailHeader: ({ tab, onSetTab }: { tab: string; onSetTab: (t: string) => void }) => (
    <div>
      <span data-testid="tab">{tab}</span>
      <button onClick={() => onSetTab("findings")}>to-findings</button>
    </div>
  ),
}));
vi.mock("./_components/OverviewTab", () => ({
  OverviewTab: ({
    diffPaths,
    onOpenFile,
  }: {
    diffPaths: string[];
    onOpenFile: (p: string, l: number | null) => void;
  }) => (
    <div>
      <span data-testid="diff-paths">{diffPaths.join(",")}</span>
      <button onClick={() => onOpenFile("src/a.ts", 12)}>open-with-line</button>
      <button onClick={() => onOpenFile("src/dir/x y.ts", null)}>open-no-line</button>
    </div>
  ),
}));
vi.mock("./_components/FindingsTab", () => ({ FindingsTab: () => <div>findings-tab</div> }));
vi.mock("./_components/RunTraceDrawer", () => ({ default: () => null }));
vi.mock("./_components/DiffTab", () => ({
  DiffTab: ({ target }: { target: unknown }) => <div data-testid="diff-target">{JSON.stringify(target)}</div>,
}));

import PRDetailPage from "./page";

function renderPage(search: string) {
  h.search = search;
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <PRDetailPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.push.mockReset();
  h.replace.mockReset();
});
afterEach(cleanup);

describe("PRDetailPage brief navigation", () => {
  // Catches: AC-26 - opening a file from the brief must PUSH (so Back returns to Overview, not
  // replace), target the Files tab with an encoded path, and only add `line` when one is known.
  it("openFile pushes ?tab=diff&file=…(&line=…) and the Overview gets the diff's file paths", () => {
    renderPage("");
    expect(screen.getByTestId("diff-paths")).toHaveTextContent("src/a.ts,src/b.ts");

    fireEvent.click(screen.getByRole("button", { name: "open-with-line" }));
    expect(h.push).toHaveBeenLastCalledWith("/repos/repo1/pulls/482?tab=diff&file=src%2Fa.ts&line=12");

    fireEvent.click(screen.getByRole("button", { name: "open-no-line" }));
    const url = h.push.mock.calls.at(-1)![0] as string;
    expect(url).toMatch(/^\/repos\/repo1\/pulls\/482\?tab=diff&file=/);
    expect(new URLSearchParams(url.split("?")[1]).get("file")).toBe("src/dir/x y.ts");
    expect(url).not.toContain("line=");
    expect(h.replace).not.toHaveBeenCalled();
  });

  // Catches: AC-26 - a manual tab switch keeping `file`/`line` would re-target the diff later.
  it("a manual tab switch replaces the URL and drops file and line (keeping other params)", () => {
    renderPage("tab=diff&file=src%2Fa.ts&line=12&trace=run1");
    fireEvent.click(screen.getByRole("button", { name: "to-findings" }));
    expect(h.replace).toHaveBeenCalledTimes(1);
    const url = h.replace.mock.calls[0]![0] as string;
    const sp = new URLSearchParams(url.split("?")[1]);
    expect(sp.get("tab")).toBe("findings");
    expect(sp.has("file")).toBe(false);
    expect(sp.has("line")).toBe(false);
    expect(sp.get("trace")).toBe("run1");
    expect(h.push).not.toHaveBeenCalled();
  });

  // Catches: AC-26/AC-39 direct URL - the target must reach the Files tab on a fresh load, and a
  // bad `line` (non-number, 0, negative, fractional) must degrade to "no line" rather than NaN.
  it("a direct URL passes {path,line} to the Files tab and sanitises the line", () => {
    const { unmount } = renderPage("tab=diff&file=src%2Fa.ts&line=7");
    expect(screen.getByTestId("diff-target")).toHaveTextContent('{"path":"src/a.ts","line":7}');
    unmount();

    for (const bad of ["abc", "0", "-3", "2.5", ""]) {
      const view = renderPage(`tab=diff&file=src%2Fa.ts&line=${bad}`);
      expect(screen.getByTestId("diff-target")).toHaveTextContent('{"path":"src/a.ts","line":null}');
      view.unmount();
    }

    const noFile = renderPage("tab=diff&line=5");
    expect(screen.getByTestId("diff-target")).toHaveTextContent("null");
    noFile.unmount();
  });
});
