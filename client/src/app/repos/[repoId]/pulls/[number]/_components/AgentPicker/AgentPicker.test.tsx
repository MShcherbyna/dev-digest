/* AgentPicker — S1 popover tests (AC-7 to AC-14). The default selection
   (AC-10, unit-tested in multi-agent-estimate.test.ts) pre-checks every
   enabled agent, so these tests drive the "2 of 4 checked" / "9th disabled"
   scenarios by toggling FROM that default rather than fighting it. */
import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { api, ApiError } from "@/lib/api";
import type { Agent, AgentUsageStats } from "@devdigest/shared";
import { AgentPicker } from "./AgentPicker";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

vi.mock("@/lib/api", async (orig) => {
  const actual = await orig<typeof import("@/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() } };
});

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

function agent(o: Partial<Agent>): Agent {
  return {
    id: "a1",
    name: "Security",
    description: "Finds vulns",
    provider: "anthropic",
    model: "claude",
    system_prompt: "",
    enabled: true,
    version: 1,
    strategy: "single-pass",
    ci_fail_on: "critical",
    repo_intel: true,
    ...o,
  };
}

function stats(o: Partial<AgentUsageStats>): AgentUsageStats {
  return {
    runs_30d: 10,
    runs_trend: [],
    accept_pct: null,
    avg_cost_usd: 0.05,
    cost_delta_usd: null,
    avg_duration_ms: 8000,
    findings_30d: 0,
    skill_usage: [],
    memory_usage: [],
    severity_weekly: [],
    by_category: [],
    recent_runs: [],
    ...o,
  };
}

function serve({
  agents,
  statsById = {},
  lastSelection = null,
}: {
  agents: Agent[];
  statsById?: Record<string, AgentUsageStats>;
  lastSelection?: string[] | null;
}) {
  get.mockImplementation(async (path: string) => {
    if (path === "/agents") return agents as never;
    const statsMatch = path.match(/^\/agents\/(.+)\/stats$/);
    if (statsMatch) {
      const s = statsById[statsMatch[1]!];
      if (!s) throw new ApiError("not found", 404);
      return s as never;
    }
    if (path.endsWith("/multi-agent/last-selection")) return { agent_ids: lastSelection } as never;
    if (path.endsWith("/multi-agent")) throw new ApiError("not found", 404);
    throw new Error(`unexpected GET ${path}`);
  });
}

function renderPicker(repoId = "repo1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithIntl(
    <QueryClientProvider client={qc}>
      <AgentPicker prId="pr1" repoId={repoId} trigger={<button type="button">Run Review</button>} />
    </QueryClientProvider>,
  );
}

async function openPicker() {
  await userEvent.click(screen.getByRole("button", { name: "Run Review" }));
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("AgentPicker", () => {
  it("AC-7/AC-11/AC-12: lists only enabled agents with estimates; unchecking down to 2 updates the run label and combined estimate", async () => {
    // Catches: disabled agents leaking into the list, "no estimate yet" not
    // shown for a zero-history agent, and the combined estimate not
    // recomputing when the selection shrinks.
    serve({
      agents: [
        agent({ id: "a1", name: "Security" }),
        agent({ id: "a2", name: "Performance" }),
        agent({ id: "a3", name: "Mentor" }),
        agent({ id: "a4", name: "Disabled one", enabled: false }),
      ],
      statsById: {
        a1: stats({ avg_duration_ms: 8200, avg_cost_usd: 0.06 }),
        a2: stats({ avg_duration_ms: 7400, avg_cost_usd: 0.05 }),
        // a3 has no stats -> "no estimate yet"
      },
    });
    renderPicker();
    await openPicker();

    expect(await screen.findByText("Security")).toBeInTheDocument();
    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.getByText("Mentor")).toBeInTheDocument();
    expect(screen.queryByText("Disabled one")).not.toBeInTheDocument();
    expect(screen.getByText("no estimate yet")).toBeInTheDocument();

    // F-4: the checkbox's accessible name must include both the agent name
    // AND its estimate text, not just the name (estimate used to render as a
    // sibling <span> outside the Checkbox's <label>, so it was excluded).
    expect(screen.getByRole("checkbox", { name: "Security 8.2s · $0.06" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Mentor no estimate yet" })).toBeInTheDocument();

    // Default selection pre-checks every enabled agent (AC-10) -> label "(3)".
    expect(screen.getByRole("button", { name: "Run multi-agent review (3)" })).toBeInTheDocument();

    // Uncheck Mentor (no estimate) to leave exactly Security + Performance checked.
    await userEvent.click(screen.getByRole("checkbox", { name: /Mentor/ }));
    expect(screen.getByRole("button", { name: "Run multi-agent review (2)" })).toBeInTheDocument();
    expect(screen.getByText("≈ 8.2s · $0.11")).toBeInTheDocument();
  });

  it("AC-9: the 9th checkbox is disabled while 8 are already checked, and unchecking one re-enables it", async () => {
    // Catches: the 8-agent cap not enforced in the picker UI.
    const agents = Array.from({ length: 9 }, (_, i) => agent({ id: `a${i}`, name: `Agent ${i}` }));
    serve({ agents, statsById: {} });
    renderPicker();
    await openPicker();

    // Default selection caps at 8, so "Agent 8" starts unchecked and disabled.
    const ninth = await screen.findByRole("checkbox", { name: /Agent 8/ });
    expect(ninth).toHaveAttribute("aria-checked", "false");
    const ninthRow = ninth.closest("div") as HTMLElement;
    expect(ninthRow).toHaveAttribute("title", "Up to 8 agents per run");

    await userEvent.click(screen.getByRole("checkbox", { name: /Agent 0/ }));
    await userEvent.click(ninth);
    expect(ninth).toHaveAttribute("aria-checked", "true");
  });

  it("AC-8: exactly one agent checked calls the single-agent /review endpoint, not /multi-agent-run", async () => {
    // Catches: a single selected agent routing through the multi-agent flow.
    serve({ agents: [agent({ id: "a1", name: "Security" }), agent({ id: "a2", name: "Performance" })] });
    post.mockResolvedValue({ runs: [{ run_id: "run-1" }] } as never);
    renderPicker();
    await openPicker();
    await screen.findByText("Security");

    await userEvent.click(screen.getByRole("checkbox", { name: /Performance/ }));
    await userEvent.click(screen.getByRole("button", { name: "Run multi-agent review (1)" }));

    await waitFor(() => expect(post).toHaveBeenCalledWith("/pulls/pr1/review", { agentId: "a1" }));
    expect(post).not.toHaveBeenCalledWith("/pulls/pr1/multi-agent-run", expect.anything());
    expect(push).not.toHaveBeenCalled();
  });

  it("AC-9b: two or more agents checked calls POST /multi-agent-run and navigates to the results page", async () => {
    serve({ agents: [agent({ id: "a1", name: "Security" }), agent({ id: "a2", name: "Performance" })] });
    post.mockResolvedValue({ id: "run-abc", pr_id: "pr1" } as never);
    renderPicker();
    await openPicker();
    await screen.findByText("Security");

    await userEvent.click(screen.getByRole("button", { name: "Run multi-agent review (2)" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/pulls/pr1/multi-agent-run", { agent_ids: ["a1", "a2"] }),
    );
    expect(push).toHaveBeenCalledWith("/multi-agent-review/run-abc");
  });

  it("AC-14: 'Configure agents…' links to Configure run with the current PR id", async () => {
    serve({ agents: [agent({ id: "a1", name: "Security" })] });
    renderPicker();
    await openPicker();
    await screen.findByText("Security");

    await userEvent.click(screen.getByRole("button", { name: "Configure agents…" }));
    expect(push).toHaveBeenCalledWith("/multi-agent-review/configure?pr=pr1");
  });

  it("zero agents enabled shows the empty note; Clear empties the selection; a failing stats call still renders 'no estimate yet'", async () => {
    // Catches: the picker crashing/blanking when /agents/:id/stats 500s, and
    // Clear not actually clearing the selection count.
    serve({ agents: [] });
    renderPicker();
    await openPicker();
    expect(screen.getByText("No agents enabled — enable one in Settings → Agents")).toBeInTheDocument();
    cleanup();

    serve({ agents: [agent({ id: "a1", name: "Security" })] });
    get.mockImplementation(async (path: string) => {
      if (path === "/agents") return [agent({ id: "a1", name: "Security" })] as never;
      if (path === "/agents/a1/stats") throw new ApiError("boom", 500);
      if (path.endsWith("/multi-agent/last-selection")) return { agent_ids: null } as never;
      if (path.endsWith("/multi-agent")) throw new ApiError("not found", 404);
      throw new Error(`unexpected GET ${path}`);
    });
    renderPicker();
    await openPicker();
    expect(await screen.findByText("no estimate yet")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Clear"));
    const runButton = screen.getByRole("button", { name: "Run multi-agent review (0)" });
    expect(runButton).toBeDisabled();
  });
});
