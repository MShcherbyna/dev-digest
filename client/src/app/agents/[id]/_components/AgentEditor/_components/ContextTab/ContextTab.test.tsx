import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));

// Mock at the API boundary: the REAL hooks (optimistic update + rollback) run.
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: mocks.get, put: mocks.put },
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/api" } }),
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

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithIntl(
    <QueryClientProvider client={qc}>
      <ContextTab agent={AGENT} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.get.mockReset().mockImplementation(async (url: string) => {
    if (url === "/agents/ag1/context") return { paths: ["specs/a.md"] };
    if (url === "/repos/r1/context") return LISTING;
    throw new Error(`unexpected GET ${url}`);
  });
  mocks.put.mockReset();
});
afterEach(cleanup);

describe("agent ContextTab", () => {
  it("shows title, hint, N of M badge, token footer and the injection note", async () => {
    // Catches: the tab layout drifting from the spec (AC-12) or a wrong token total (AC-17).
    renderTab();
    expect(await screen.findByRole("heading", { name: "Project context" })).toBeInTheDocument();
    expect(await screen.findByText("1 of 3 attached")).toBeInTheDocument();
    expect(screen.getByText(/Order matters/)).toHaveTextContent("## Project context");
    expect(screen.getByText("≈ 10 tokens")).toBeInTheDocument();
    expect(screen.getByText("Injected as an untrusted block (## Project context) into every run.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Filter documents…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
    // the SERIALIZES AS box (same as on the skill tab) lists the attached paths under the design heading
    expect(screen.getByText("Serializes as")).toBeInTheDocument();
    expect(document.querySelector("pre")?.textContent).toBe("## Project specifications\n- specs/a.md");
  });

  it("AC-14: a toggle updates the UI at once, persists the full list without Save, and rolls back when the PUT fails", async () => {
    // Catches: UI waiting on the server, partial patches, a failed save leaving the UI out of sync.
    let reject!: (e: Error) => void;
    mocks.put.mockImplementation(() => new Promise((_res, rej) => (reject = rej)));
    renderTab();
    await screen.findByText("1 of 3 attached");

    await userEvent.click(screen.getByRole("checkbox", { name: "Attach docs/b.md" }));
    // optimistic: before the request settled
    expect(await screen.findByText("2 of 3 attached")).toBeInTheDocument();
    expect(screen.getByText("≈ 40 tokens")).toBeInTheDocument();
    expect(mocks.put).toHaveBeenCalledWith("/agents/ag1/context", { paths: ["specs/a.md", "docs/b.md"] });

    reject(new Error("boom"));
    await waitFor(() => expect(screen.getByText("1 of 3 attached")).toBeInTheDocument());
    expect(screen.getByRole("checkbox", { name: "Attach docs/b.md" })).not.toBeChecked();
    expect(screen.getByText("≈ 10 tokens")).toBeInTheDocument();
  });
});
