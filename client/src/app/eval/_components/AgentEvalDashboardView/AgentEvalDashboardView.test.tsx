import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, within, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { agentCard, agentDashboard, compareResponse } from "@/test/eval-fixtures";
import type { AgentEvalDashboardResponse, RegressionAlert } from "@/lib/hooks/eval";
import { api, ApiError } from "@/lib/api";
import { AgentEvalDashboardView } from "./AgentEvalDashboardView";

const push = vi.fn();
const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/eval/ag1",
  useSearchParams: () => new URLSearchParams(search),
}));
// AppShell pulls in the sidebar / repo context; it renders the breadcrumb here so the trail is testable.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ crumb, children }: { crumb: { label: string }[]; children: React.ReactNode }) => (
    <div>
      <nav aria-label="breadcrumb">{crumb.map((c) => c.label).join(" › ")}</nav>
      {children}
    </div>
  ),
}));
// jsdom has no layout, so recharts only logs width(0)/height(0) warnings; the chart maths is in MetricTrendChart/helpers.test.ts.
vi.mock("recharts", () => {
  const Null = () => null;
  return { ResponsiveContainer: Null, LineChart: Null, Line: Null, XAxis: Null, YAxis: Null, CartesianGrid: Null };
});
vi.mock("@/lib/api", async (orig) => {
  const actual = await orig<typeof import("@/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() } };
});

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

function serve(dash: AgentEvalDashboardResponse | ApiError) {
  get.mockImplementation(async (path: string) => {
    if (path.startsWith("/agents/ag1/eval-dashboard")) {
      if (dash instanceof ApiError) throw dash;
      return dash as never;
    }
    if (path === "/eval/dashboard") {
      return {
        agents: [agentCard(), agentCard({ id: "ag2", name: "Style reviewer" })],
        recent_runs: [],
      } as never;
    }
    if (path.startsWith("/eval-runs/compare")) return compareResponse() as never;
    throw new Error(`unexpected GET ${path}`);
  });
}

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithIntl(
    <QueryClientProvider client={qc}>
      <AgentEvalDashboardView agentId="ag1" />
    </QueryClientProvider>,
  );
}

const alertOf = (over: Partial<RegressionAlert> = {}): RegressionAlert => ({
  version: 3,
  dropped: [{ metric: "recall", points: 4 }],
  rose: [],
  held: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  search = "";
});
afterEach(cleanup);

describe("AgentEvalDashboardView", () => {
  it("renders the header, switches agent, and keeps the range in the URL (default omitted)", async () => {
    // Catches: wrong header/breadcrumb data, switcher not navigating to /eval/<id>, range not
    // persisted in ?range= (P2-AC-6), the default 30d leaking into the URL, and an unknown
    // ?range= value reaching the API instead of falling back to 30d.
    search = "range=bogus";
    serve(agentDashboard());
    renderView();

    expect(await screen.findByRole("heading", { name: "Security reviewer" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "breadcrumb" })).toHaveTextContent("Skills Lab › Eval Dashboard › Security reviewer");
    expect(screen.getByText("claude-sonnet")).toBeInTheDocument();
    expect(screen.getByText("Regression harness · 2 runs on the 5-trace gold set")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /All agents/ })).toHaveAttribute("href", "/eval");
    expect(get).toHaveBeenCalledWith("/agents/ag1/eval-dashboard?range=30d");

    await userEvent.click(screen.getByRole("button", { name: "Switch agent" }));
    await userEvent.click(await screen.findByRole("button", { name: "Style reviewer" }));
    expect(push).toHaveBeenCalledWith("/eval/ag2");

    await userEvent.click(screen.getByRole("button", { name: "Date range: 30 days" }));
    await userEvent.click(screen.getByRole("button", { name: "7 days" }));
    expect(replace).toHaveBeenLastCalledWith("/eval/ag1?range=7d");

    cleanup();
    search = "range=7d";
    renderView();
    await userEvent.click(await screen.findByRole("button", { name: "Date range: 7 days" }));
    expect(get).toHaveBeenCalledWith("/agents/ag1/eval-dashboard?range=7d");
    await userEvent.click(screen.getByRole("button", { name: "30 days" }));
    expect(replace).toHaveBeenLastCalledWith("/eval/ag1");
  });

  it("shows the regression banner only when the server sends an alert, in each wording variant", async () => {
    // Catches: banner shown without an alert, the dropped part not bold, rose/held tail
    // wording wrong (singular vs "both up"), multiple drops not joined (P2-AC-11).
    serve(agentDashboard({ alert: null }));
    renderView();
    await screen.findByRole("heading", { name: "Security reviewer" });
    expect(screen.queryByText(/dipped/)).not.toBeInTheDocument();

    cleanup();
    serve(agentDashboard({ alert: alertOf({ rose: ["precision"], held: ["citation_accuracy"] }) }));
    renderView();
    const banner = (await screen.findByText(/dipped/)).closest("div")!;
    expect(within(banner).getByText("Recall dipped 4pts").tagName).toBe("STRONG");
    expect(banner).toHaveTextContent("on v3 — an expected finding was missed. Precision up. Citation held.");

    cleanup();
    serve(
      agentDashboard({
        alert: alertOf({
          dropped: [
            { metric: "precision", points: 1 },
            { metric: "citation_accuracy", points: 7 },
          ],
          rose: ["recall", "citation_accuracy"],
        }),
      }),
    );
    renderView();
    const multi = (await screen.findByText(/dipped/)).closest("div")!;
    expect(within(multi).getByText("Precision dipped 1pt, Citation dipped 7pts").tagName).toBe("STRONG");
    expect(multi).toHaveTextContent("a new false positive slipped in. Recall and citation both up.");
  });

  it("handles null metrics, a zero delta, an empty range and a missing agent", async () => {
    // Catches: null metric rendering 0%/NaN or a delta against nothing, a zero delta printed as
    // movement, an empty range hiding the header, and a 404 falling into the generic error.
    serve(
      agentDashboard({
        current: {
          run_id: "run2",
          agent_version: 3,
          cases_passed: 4,
          cases_executed: 5,
          cost_usd: null,
          recall: null,
          precision: 0.9,
          citation_accuracy: 0.75,
        },
        delta: { recall: 0.04, precision: -0.02, citation_accuracy: 0 },
      }),
    );
    renderView();
    const noData = await screen.findByLabelText("no data");
    expect(noData).toHaveTextContent("—");
    expect(screen.queryByText("up 0.04")).not.toBeInTheDocument(); // delta of a null tile is dropped
    expect(screen.getByText("down 0.02")).toBeInTheDocument();
    expect(screen.queryByText(/up 0\.00|down 0\.00/)).not.toBeInTheDocument();

    cleanup();
    serve(agentDashboard({ runs_in_range: 0, runs: [], trend: [], current: null, delta: null }));
    renderView();
    expect(await screen.findByText("No runs in this range")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Security reviewer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run eval" })).toBeEnabled();

    cleanup();
    serve(new ApiError("not found", 404, "not_found"));
    renderView();
    expect(await screen.findByText("Agent not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All agents" })).toHaveAttribute("href", "/eval");
  });

  it("run eval toasts a mapped error; compare opens the modal on success and only toasts on failure", async () => {
    // Catches: a 409 from Run eval being swallowed or shown as a generic error; a failed compare
    // (422) still opening the modal (P2-AC-14); a successful compare not opening it.
    serve(agentDashboard());
    post.mockRejectedValueOnce(new ApiError("active", 409, "eval_run_active"));
    renderView();
    await userEvent.click(await screen.findByRole("button", { name: "Run eval" }));
    expect(await screen.findByText("An eval run is already in progress for this agent")).toBeInTheDocument();

    const older = screen.getByRole("checkbox", { name: /Select run v2/ });
    const newer = screen.getByRole("checkbox", { name: /Select run v3/ });
    await userEvent.click(older);
    await userEvent.click(newer);

    const base = get.getMockImplementation()!;
    get.mockImplementation(async (path: string) => {
      if (path.startsWith("/eval-runs/compare")) throw new ApiError("cross", 422, "compare_cross_agent");
      return base(path);
    });
    await userEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(await screen.findByText("Could not compare these runs")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    get.mockImplementation(base);
    await userEvent.click(screen.getByRole("checkbox", { name: /Select run v2/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Select run v2/ }));
    await userEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(await screen.findByRole("dialog", { name: "Compare runs · v2 → v3" })).toBeInTheDocument();
  });

  it("returns focus to the Compare button when Esc closes a modal that mounted after the delayed fetch", async () => {
    // Catches (B-3): the modal mounts only after the compare fetch, when the Compare button is
    // busy and has lost focus, so a hook reading document.activeElement at mount sent focus to
    // <body> on Esc. Fails pre-fix (no compareTrigger / returnFocusTo): the opener would be <body>.
    serve(agentDashboard());
    renderView();
    await userEvent.click(await screen.findByRole("checkbox", { name: /Select run v2/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Select run v3/ }));

    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const base = get.getMockImplementation()!;
    get.mockImplementation(async (path: string) => {
      if (path.startsWith("/eval-runs/compare")) await gate;
      return base(path);
    });

    const compareBtn = screen.getByRole("button", { name: "Compare" });
    compareBtn.focus();
    await userEvent.click(compareBtn);
    // A real browser blurs the button while it is loading/disabled; jsdom does not, so do it.
    compareBtn.blur();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    release();
    await screen.findByRole("dialog", { name: "Compare runs · v2 → v3" });
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Compare" })).toHaveFocus();
  });
});
