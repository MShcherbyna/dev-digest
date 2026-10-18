import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { AGENT, ciRun, installation, PREVIEW } from "@/test/ci-fixtures";
import { api, ApiError } from "@/lib/api";
import { CiTab } from "./CiTab";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), patch: vi.fn() },
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    activeRepo: { full_name: "acme/api" },
    repos: [{ id: "r1", full_name: "acme/api" }, { id: "r2", full_name: "acme/web" }],
  }),
}));

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);
let installs = [installation(), installation({ id: "i2", repo: "acme/billing", status: "outdated", last_run_status: "succeeded", last_run_at: new Date(Date.now() - 4 * 60_000).toISOString() })];
let refreshFails = false;

function serve() {
  get.mockImplementation(async (path: string) => {
    if (path.includes("/ci/installations")) return installs as never;
    if (path.startsWith("/ci-runs")) return Array.from({ length: 12 }, (_, i) => ciRun({ id: `r${i}` })) as never;
    throw new Error(`unexpected GET ${path}`);
  });
  post.mockImplementation(async (path: string) => {
    if (path === "/ci-runs/refresh") {
      if (refreshFails) throw new ApiError("down", 502, "github_error");
      return { ingested: 0, rejected: 0, failed: 0, errors: [] } as never;
    }
    if (path.endsWith("/ci/preview")) return PREVIEW as never;
    throw new Error(`unexpected POST ${path}`);
  });
}

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithIntl(
    <QueryClientProvider client={qc}>
      <CiTab agent={AGENT} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  refreshFails = false;
  installs = [installation(), installation({ id: "i2", repo: "acme/billing", status: "outdated", last_run_status: "succeeded", last_run_at: new Date(Date.now() - 4 * 60_000).toISOString() })];
  serve();
});
afterEach(cleanup);

describe("CiTab", () => {
  it("shows the empty state with Export to CI when there are no installations (AC-1)", async () => {
    installs = [];
    renderTab();
    expect(await screen.findByText("Not exported to CI")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Export to CI" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Run Security Reviewer automatically on pull requests")).toBeInTheDocument();
  });

  it("lists installations, counts active+outdated, caps recent runs at 10 and links View all (AC-1, 26, 29)", async () => {
    renderTab();
    expect(await screen.findByText("Active in 2 repos")).toBeInTheDocument();
    expect(screen.getByText("acme/billing")).toBeInTheDocument();
    expect(screen.getByText("outdated")).toBeInTheDocument();
    expect(screen.getByText("4m ago")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add repository" })).toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(11));
    expect(screen.getByRole("link", { name: "View all" })).toHaveAttribute("href", "/ci-runs?agent=ag1");
  });

  it("saves Fail CI on through the agent update (AC-27)", async () => {
    vi.mocked(api.put).mockResolvedValue({ ...AGENT, ci_fail_on: "any", version: 3 } as never);
    renderTab();
    const select = await screen.findByRole("combobox", { name: /Fail CI on/ });
    expect(select).toHaveValue("critical");
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(select, { target: { value: "any" } });
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/agents/ag1", { ci_fail_on: "any" }));
  });

  it("shows the non-blocking refresh banner and retries (AC-24)", async () => {
    refreshFails = true;
    renderTab();
    const banner = await screen.findByText("Couldn't refresh CI runs");
    expect(screen.getByText("Active in 2 repos")).toBeInTheDocument();
    refreshFails = false;
    const before = post.mock.calls.filter((c) => c[0] === "/ci-runs/refresh").length;
    await userEvent.click(within(banner.closest("[role='alert']") as HTMLElement).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(post.mock.calls.filter((c) => c[0] === "/ci-runs/refresh").length).toBeGreaterThan(before));
  });

  it("Update CI config opens the wizard at Preview, prefilled, for the outdated installation (AC-28)", async () => {
    renderTab();
    await userEvent.click(await screen.findByRole("button", { name: "Update CI config" }));
    expect(await screen.findByText(".devdigest/memory.jsonl")).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith("/agents/ag1/ci/preview", { repo: "acme/billing", target: "gha", triggers: ["opened", "synchronize"], post_as: "github_review" });
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  });

  it("Add repository lists only repos without an installation and gates Continue (AC-2)", async () => {
    renderTab();
    await userEvent.click(await screen.findByRole("button", { name: "Add repository" }));
    const select = screen.getByRole("combobox", { name: /Target repository/ });
    expect(within(select).queryByRole("option", { name: "acme/api" })).not.toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "acme/web" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue/ })).toBeDisabled();
  });
});
