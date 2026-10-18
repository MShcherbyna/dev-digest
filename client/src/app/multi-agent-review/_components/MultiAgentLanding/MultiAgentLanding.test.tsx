/* MultiAgentLanding — AC-36: zero enabled agents renders the design's empty
   state; enabled agents with no recent run yet redirect to Configure run;
   enabled agents with recent runs show the list instead, with a button to
   start another (so leaving a run doesn't force a new Configure run). */
import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { api } from "@/lib/api";
import type { Agent } from "@devdigest/shared";
import type { RecentMultiAgentRun } from "@/lib/types";
import { MultiAgentLanding } from "./MultiAgentLanding";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/api", async (orig) => {
  const actual = await orig<typeof import("@/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() } };
});

const get = vi.mocked(api.get);

function agent(o: Partial<Agent>): Agent {
  return {
    id: "a1",
    name: "Security",
    description: "",
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

function run(o: Partial<RecentMultiAgentRun>): RecentMultiAgentRun {
  return {
    id: "run-1",
    pr_id: "pr-1",
    pr_number: 42,
    pr_title: "Fix the thing",
    repo_full_name: "acme/payments-api",
    ran_at: "2026-10-18T12:00:00Z",
    agent_count: 3,
    cancelled: false,
    ...o,
  };
}

function serve({ agents = [], runs = [] }: { agents?: Agent[]; runs?: RecentMultiAgentRun[] }) {
  get.mockImplementation(async (path: string) => {
    if (path === "/agents") return agents as never;
    if (path.startsWith("/multi-agent-runs?")) return runs as never;
    throw new Error(`unexpected GET ${path}`);
  });
}

function renderLanding() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithIntl(
    <QueryClientProvider client={qc}>
      <MultiAgentLanding />
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("MultiAgentLanding (AC-36)", () => {
  it("zero enabled agents renders the empty state with a working 'Go to Agents' button", async () => {
    serve({ agents: [agent({ enabled: false })] });
    renderLanding();

    expect(await screen.findByText("Enable agents to run reviews")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Multi-agent review runs the PR through every enabled agent in parallel. You have no agents enabled yet.",
      ),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Go to Agents" }));
    expect(push).toHaveBeenCalledWith("/agents");
  });

  it("enabled agents with no recent run yet redirect straight to Configure run", async () => {
    serve({ agents: [agent({ enabled: true })], runs: [] });
    renderLanding();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/multi-agent-review/configure"));
    expect(screen.queryByText("Enable agents to run reviews")).not.toBeInTheDocument();
  });

  it("enabled agents with recent runs show the list instead of redirecting, with a 'run new' button", async () => {
    serve({
      agents: [agent({ enabled: true })],
      runs: [
        run({ id: "run-1", pr_number: 42, pr_title: "Fix the thing" }),
        run({ id: "run-2", pr_number: 7, pr_title: "Add dark mode", cancelled: true, agent_count: 2 }),
      ],
    });
    renderLanding();

    expect(await screen.findByText("#42 · Fix the thing")).toBeInTheDocument();
    expect(screen.getByText("#7 · Add dark mode")).toBeInTheDocument();
    expect(screen.getByText("cancelled")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();

    await userEvent.click(screen.getByText("#42 · Fix the thing"));
    expect(push).toHaveBeenCalledWith("/multi-agent-review/run-1");

    await userEvent.click(screen.getByRole("button", { name: "Run new multi-agent review" }));
    expect(push).toHaveBeenCalledWith("/multi-agent-review/configure");
  });

  it("searches the recent-runs list by PR number, title or repo", async () => {
    serve({
      agents: [agent({ enabled: true })],
      runs: [
        run({ id: "run-1", pr_number: 42, pr_title: "Fix the thing", repo_full_name: "acme/payments-api" }),
        run({ id: "run-2", pr_number: 7, pr_title: "Add dark mode", repo_full_name: "acme/web" }),
      ],
    });
    renderLanding();

    expect(await screen.findByText("#42 · Fix the thing")).toBeInTheDocument();
    const search = screen.getByPlaceholderText("Search by PR, title or repo…");

    await userEvent.type(search, "dark");
    expect(screen.queryByText("#42 · Fix the thing")).not.toBeInTheDocument();
    expect(screen.getByText("#7 · Add dark mode")).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, "payments");
    expect(screen.getByText("#42 · Fix the thing")).toBeInTheDocument();
    expect(screen.queryByText("#7 · Add dark mode")).not.toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, "999");
    expect(screen.getByText("No runs match your search.")).toBeInTheDocument();
  });
});
