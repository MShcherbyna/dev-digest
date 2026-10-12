import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), repo: { id: "r1", full_name: "acme/api" } as { id: string; full_name: string } | null }));

// Mock at the API boundary: the REAL hooks (optimistic update + rollback) run.
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: mocks.get, put: mocks.put },
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: mocks.repo }),
}));

import { ContextTab } from "./ContextTab";

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;
const file = (path: string, type: string, tokens: number) => ({
  path,
  type,
  size: tokens * 4,
  tokens,
  too_large: false,
  used_by: 0,
});
const LISTING = {
  glob: "**/{specs,docs,insights}/**/*.md",
  scanned_at: "2026-10-11T10:00:00Z",
  cloned: true,
  truncated: false,
  total: 3,
  files: [file("specs/a.md", "specs", 10), file("docs/b.md", "docs", 30), file("docs/c.md", "docs", 5)],
};
const REPOS = { r1: { id: "r1", full_name: "acme/api" }, r2: { id: "r2", full_name: "acme/web" } };

// Stored attachment list per repo: a tiny stateful "server".
let stored: Record<string, string[]>;

/** Renders the tab under a harness whose buttons switch the (mocked) active repo. */
function Harness({ initial }: { initial: string }) {
  const [repoId, setRepoId] = React.useState<string>(initial);
  mocks.repo = repoId === "none" ? null : REPOS[repoId as "r1" | "r2"];
  return (
    <>
      <button onClick={() => setRepoId("r1")}>to r1</button>
      <button onClick={() => setRepoId("r2")}>to r2</button>
      <button onClick={() => setRepoId("none")}>to none</button>
      <ContextTab agent={AGENT} />
    </>
  );
}

function renderTab(initial = "r1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithIntl(
    <QueryClientProvider client={qc}>
      <Harness initial={initial} />
    </QueryClientProvider>,
  );
}

const serializes = () => document.querySelector("pre")?.textContent;

beforeEach(() => {
  stored = { r1: ["specs/a.md"], r2: [] };
  mocks.repo = REPOS.r1;
  mocks.get.mockReset().mockImplementation(async (url: string) => {
    const m = /^\/agents\/ag1\/context\?repo_id=(r\d)$/.exec(url);
    if (m) return { paths: stored[m[1]!] };
    if (url === "/repos/r1/context" || url === "/repos/r2/context") return LISTING;
    throw new Error(`unexpected GET ${url}`);
  });
  mocks.put.mockReset();
});
afterEach(cleanup);

describe("agent ContextTab", () => {
  it("shows title, hint, N of M badge, token footer and the injection note", async () => {
    // Catches: the tab layout drifting from the spec (AC-12) or a wrong token total (AC-17);
    // the list GET missing the active repo (AC-37).
    renderTab();
    expect(await screen.findByRole("heading", { name: "Project context" })).toBeInTheDocument();
    expect(await screen.findByText("1 of 3 attached")).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith("/agents/ag1/context?repo_id=r1");
    expect(screen.getByText(/Order matters/)).toHaveTextContent("## Project context");
    expect(screen.getByText("≈ 10 tokens")).toBeInTheDocument();
    expect(screen.getByText("Injected as an untrusted block (## Project context) into every run.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Filter documents…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
    expect(screen.getByText("Serializes as")).toBeInTheDocument();
    expect(serializes()).toBe("## Project specifications\n- specs/a.md");
  });

  it("AC-14: a toggle updates the UI at once, PUTs the full list for the active repo without Save, and rolls back when the PUT fails", async () => {
    // Catches: UI waiting on the server, partial patches, a PUT without repo_id, a failed save leaving the UI out of sync.
    let reject!: (e: Error) => void;
    mocks.put.mockImplementation(() => new Promise((_res, rej) => (reject = rej)));
    renderTab();
    await screen.findByText("1 of 3 attached");

    await userEvent.click(screen.getByRole("checkbox", { name: "Attach docs/b.md" }));
    expect(await screen.findByText("2 of 3 attached")).toBeInTheDocument();
    expect(screen.getByText("≈ 40 tokens")).toBeInTheDocument();
    expect(mocks.put).toHaveBeenCalledWith("/agents/ag1/context?repo_id=r1", { paths: ["specs/a.md", "docs/b.md"] });

    reject(new Error("boom"));
    await waitFor(() => expect(screen.getByText("1 of 3 attached")).toBeInTheDocument());
    expect(screen.getByRole("checkbox", { name: "Attach docs/b.md" })).not.toBeChecked();
    expect(screen.getByText("≈ 10 tokens")).toBeInTheDocument();
  });

  it("AC-37: switching r1 -> r2 -> r1 shows each repo's own list, badge, SERIALIZES AS and token total", async () => {
    // Catches: one repo's attachments leaking into another repo's view (shared cache key / stale list).
    renderTab();
    expect(await screen.findByText("1 of 3 attached")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Attach specs/a.md" })).toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "to r2" }));
    expect(await screen.findByText("0 of 3 attached")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Attach specs/a.md" })).not.toBeChecked();
    expect(serializes()).toBe("## Project specifications");
    expect(screen.getByText("≈ 0 tokens")).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith("/agents/ag1/context?repo_id=r2");

    await userEvent.click(screen.getByRole("button", { name: "to r1" }));
    expect(await screen.findByText("1 of 3 attached")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Attach specs/a.md" })).toBeChecked();
    expect(serializes()).toBe("## Project specifications\n- specs/a.md");
  });

  it("AC-37: a toggle still in flight on r1 keeps r1 in its URL, leaves r2 untouched, and its rollback never touches r2", async () => {
    // Catches: the mutation using the repo active at settle time instead of at toggle time
    // (writing/rolling back/invalidating the wrong repo's cache).
    let reject!: (e: Error) => void;
    mocks.put.mockImplementation(() => new Promise((_res, rej) => (reject = rej)));
    renderTab();
    await screen.findByText("1 of 3 attached");
    await userEvent.click(screen.getByRole("checkbox", { name: "Attach docs/b.md" }));
    await screen.findByText("2 of 3 attached");

    await userEvent.click(screen.getByRole("button", { name: "to r2" }));
    expect(await screen.findByText("0 of 3 attached")).toBeInTheDocument();
    expect(mocks.put).toHaveBeenCalledTimes(1);
    expect(mocks.put.mock.calls[0]![0]).toBe("/agents/ag1/context?repo_id=r1");

    await act(async () => {
      reject(new Error("boom"));
    });
    expect(screen.getByText("0 of 3 attached")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Attach specs/a.md" })).not.toBeChecked();
    expect(serializes()).toBe("## Project specifications");

    // back on r1 the failed toggle is rolled back
    await userEvent.click(screen.getByRole("button", { name: "to r1" }));
    expect(await screen.findByText("1 of 3 attached")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Attach docs/b.md" })).not.toBeChecked();
  });

  it("AC-20: with no active repo it shows the hint, no rows, and never requests the agent's list", async () => {
    // Catches: a GET with an empty repo_id (422) or phantom rows without a repo.
    renderTab("none");
    expect(await screen.findByText("Select a repository to browse its documents.")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(mocks.get.mock.calls.filter(([u]) => String(u).startsWith("/agents/"))).toHaveLength(0);
  });

  it("Q2: a failing list GET shows an error with Retry and no rows; Retry re-requests with repo_id", async () => {
    // Catches: an endless skeleton on error, or rows/toggles shown for an unknown list.
    let fail = true;
    mocks.get.mockImplementation(async (url: string) => {
      if (url === "/agents/ag1/context?repo_id=r1") {
        if (fail) throw new Error("500");
        return { paths: ["specs/a.md"] };
      }
      if (url === "/repos/r1/context") return LISTING;
      throw new Error(`unexpected GET ${url}`);
    });
    renderTab();
    expect(await screen.findByText("Could not load attached documents.")).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);

    fail = false;
    mocks.get.mockClear();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByText("1 of 3 attached")).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith("/agents/ag1/context?repo_id=r1");
  });
});
