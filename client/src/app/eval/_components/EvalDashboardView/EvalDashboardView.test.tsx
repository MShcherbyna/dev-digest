import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { agentCard, recentRun } from "@/test/eval-fixtures";
import type { EvalDashboardResponse } from "@/lib/hooks/eval";
import { api } from "@/lib/api";
import { EvalDashboardView } from "./EvalDashboardView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
// AppShell pulls in the whole sidebar / repo context; this view's behaviour is inside it.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/api", async (orig) => {
  const actual = await orig<typeof import("@/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() } };
});

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithIntl(
    <QueryClientProvider client={qc}>
      <EvalDashboardView />
    </QueryClientProvider>,
  );
}

function serve(data: EvalDashboardResponse) {
  get.mockImplementation(async (path: string) => {
    if (path === "/eval/dashboard") return data as never;
    throw new Error(`unexpected GET ${path}`);
  });
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("EvalDashboardView", () => {
  it("lists agent cards (incl. never-run with null metrics) and recent runs in server order", async () => {
    // Catches: a never-run agent crashing the card or showing "NaN%"/"0%" instead of "—";
    // cards not linking to /eval/<id>; the recent-runs table re-sorting what the server ordered.
    serve({
      agents: [
        agentCard(),
        agentCard({
          id: "ag2",
          name: "Never run agent",
          last_run: null,
          recall_trend: [],
          latest: { recall: null, precision: null, citation_accuracy: null },
        }),
      ],
      recent_runs: [
        recentRun({ id: "x1", agent_name: "Newest agent", agent_version: 5, started_at: "2026-10-12T10:00:00.000Z", recall: null }),
        recentRun({ id: "x2", agent_name: "Older agent", agent_version: 2, started_at: "2026-10-01T10:00:00.000Z" }),
      ],
    });
    renderView();

    const ran = await screen.findByRole("link", { name: /open security reviewer eval dashboard/i });
    expect(ran).toHaveAttribute("href", "/eval/ag1");
    expect(within(ran).getByText(/Last run v3 · .* · 4\/5 pass/)).toBeInTheDocument();
    expect(within(ran).getByText("82%")).toBeInTheDocument();

    const never = screen.getByRole("link", { name: /open never run agent eval dashboard/i });
    expect(never).toHaveAttribute("href", "/eval/ag2");
    expect(within(never).getByText("Never run")).toBeInTheDocument();
    expect(within(never).getAllByText("—")).toHaveLength(3);
    expect(never).not.toHaveTextContent("NaN");
    expect(never).not.toHaveTextContent("0%");

    const table = screen.getByRole("table", { name: /recent eval runs/i });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Newest agent");
    expect(rows[0]).toHaveTextContent("v5");
    expect(within(rows[0]!).getByLabelText("no data")).toHaveTextContent("—"); // null recall
    expect(rows[1]).toHaveTextContent("Older agent");
  });

  it("run-all toasts started/skipped counts, and the disabled 'Running…' state comes from server data", async () => {
    // Catches: wrong toast wording/branch (started vs nothing-to-run), and the button being
    // enabled on reload while an agent still has a running run (R5: state is server-derived).
    serve({ agents: [agentCard()], recent_runs: [] });
    post.mockResolvedValueOnce({
      started: [{ agent_id: "ag1", eval_run_id: "e1" }],
      skipped: [
        { agent_id: "ag2", reason: "no_cases" },
        { agent_id: "ag3", reason: "disabled" },
      ],
    });
    renderView();

    await userEvent.click(await screen.findByRole("button", { name: "Run all agents" }));
    expect(await screen.findByText("Started 1 · skipped 2")).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith("/eval-runs/all");

    cleanup();
    vi.clearAllMocks();
    serve({ agents: [agentCard(), agentCard({ id: "ag2", has_running_run: true })], recent_runs: [] });
    post.mockResolvedValueOnce({ started: [], skipped: [{ agent_id: "ag1", reason: "already_running" }] });
    renderView();
    const busy = await screen.findByRole("button", { name: "Running…" });
    expect(busy).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Run all agents" })).not.toBeInTheDocument();

    cleanup();
    serve({ agents: [agentCard()], recent_runs: [] });
    renderView();
    await userEvent.click(await screen.findByRole("button", { name: "Run all agents" }));
    expect(await screen.findByText("Nothing to run · skipped 1")).toBeInTheDocument();
  });

  it("shows the empty state with a link to Agents, and an error state whose retry refetches", async () => {
    // Catches: an agent-less workspace rendering a blank page (P2-AC-2), and a failed load
    // having no way out (P2-AC-17: own retry button).
    serve({ agents: [], recent_runs: [] });
    renderView();
    expect(await screen.findByText("No eval cases yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run all agents" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Go to Agents" }));
    expect(push).toHaveBeenCalledWith("/agents");

    cleanup();
    serve({ agents: [agentCard()], recent_runs: [] });
    get.mockRejectedValueOnce(new Error("boom")); // first call fails, then serve()'s impl resumes
    renderView();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load the eval dashboard.");
    await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Security reviewer")).toBeInTheDocument();
  });
});
