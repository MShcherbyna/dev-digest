import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderWithIntl } from "@/test/render-intl";
import { ciRun } from "@/test/ci-fixtures";
import { api } from "@/lib/api";
import { CiRunsView } from "./CiRunsView";

const h = vi.hoisted(() => ({ search: "agent=ag1", replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace, push: h.push }),
  usePathname: () => "/ci-runs",
  useSearchParams: () => new URLSearchParams(h.search),
}));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), patch: vi.fn() },
}));
const get = vi.mocked(api.get);
let runs = [ciRun()];

beforeEach(() => {
  vi.clearAllMocks();
  runs = [ciRun()];
  get.mockImplementation(async (path: string) => {
    if (path === "/agents") return [{ id: "ag1", name: "Security Reviewer" }] as never;
    if (path === "/repos") return [{ id: "r1", full_name: "acme/api" }] as never;
    if (path.startsWith("/ci-runs")) return runs as never;
    throw new Error(path);
  });
  vi.mocked(api.post).mockResolvedValue({ ingested: 0, rejected: 0, failed: 0, errors: [] } as never);
});
afterEach(cleanup);

function view() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithIntl(<QueryClientProvider client={qc}><CiRunsView /></QueryClientProvider>);
}

describe("CiRunsView", () => {
  it("shows the header, filters, table and applies ?agent= to the query (AC-30)", async () => {
    view();
    expect(screen.getByRole("heading", { name: "CI Runs" })).toBeInTheDocument();
    expect(screen.getByText("Agent reviews executed inside CI · not local runs")).toBeInTheDocument();
    expect(screen.getByText("auto-refresh on")).toBeInTheDocument();
    expect(await screen.findByRole("table", { name: "CI runs" })).toBeInTheDocument();
    for (const l of ["Time range", "Agent", "Repository", "Status", "Source"]) expect(screen.getByRole("combobox", { name: l })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Agent" })).toHaveValue("ag1");
    const url = get.mock.calls.map((c) => c[0] as string).find((p) => p.startsWith("/ci-runs"))!;
    expect(url).toContain("agent=ag1");
    expect(url).toContain("since=");
  });
  it("filters by status and shows the empty state when nothing matches", async () => {
    runs = [];
    view();
    expect(await screen.findByText("No CI runs yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set up CI for an agent" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: "failed" } });
    await waitFor(() => expect(get.mock.calls.some((c) => String(c[0]).includes("status=failed"))).toBe(true));
  });
});
