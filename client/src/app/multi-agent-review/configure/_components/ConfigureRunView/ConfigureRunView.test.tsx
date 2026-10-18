/* ConfigureRunView — Configure run tests (AC-13, AC-14, PR-list error edge,
   AC-9's 8-cap via "Select all"). */
import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { api, ApiError } from "@/lib/api";
import type { Agent } from "@devdigest/shared";
import type { PrMeta } from "@/lib/types";
import { ConfigureRunView } from "./ConfigureRunView";

const push = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "repo1" }),
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

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr1",
    number: 42,
    title: "Fix the thing",
    author: "octocat",
    branch: "fix",
    base: "main",
    head_sha: "abc",
    additions: 1,
    deletions: 1,
    files_count: 1,
    status: "open",
    ...o,
  };
}

function serve({
  agents = [],
  pulls = [],
  pullsError = false,
}: {
  agents?: Agent[];
  pulls?: PrMeta[];
  pullsError?: boolean;
}) {
  get.mockImplementation(async (path: string) => {
    if (path === "/agents") return agents as never;
    if (path === "/repos/repo1/pulls") {
      if (pullsError) throw new ApiError("boom", 500);
      return pulls as never;
    }
    if (path.endsWith("/multi-agent/last-selection")) return { agent_ids: null } as never;
    if (path.match(/^\/agents\/.+\/stats$/)) throw new ApiError("no stats", 404);
    if (path.match(/^\/pulls\/.+\/reviews$/)) return [] as never;
    if (path.endsWith("/multi-agent")) throw new ApiError("not found", 404);
    throw new Error(`unexpected GET ${path}`);
  });
}

function renderConfigure() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithIntl(
    <QueryClientProvider client={qc}>
      <ConfigureRunView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  search = "";
});
afterEach(cleanup);

describe("ConfigureRunView", () => {
  it("AC-13: step 2 is disabled until a PR is picked, then selecting one populates the agent cards", async () => {
    // Catches: step 2 rendering agent cards before a PR is selected, or
    // never enabling once one is picked.
    serve({ agents: [agent({ id: "a1", name: "Security" }), agent({ id: "a2", name: "Performance" })], pulls: [pr({})] });
    renderConfigure();

    expect(screen.getByText("Pick a pull request first")).toBeInTheDocument();
    expect(screen.queryByText("Security")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Select a pull request…"));
    await userEvent.click(await screen.findByText("#42 · Fix the thing"));

    expect(await screen.findByText("Security")).toBeInTheDocument();
    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.queryByText("Pick a pull request first")).not.toBeInTheDocument();

    // F-5: AgentCard's Checkbox has no visible label of its own (the name is
    // shown in a sibling div), so its accessible name must come from a
    // `label` prop — assert it resolves to the agent's name.
    expect(screen.getByRole("checkbox", { name: /Security/ })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Performance/ })).toBeInTheDocument();
  });

  it("AC-14: ?pr= preselects step 1 and renders step 2 already enabled", async () => {
    search = "pr=pr1";
    serve({ agents: [agent({ id: "a1", name: "Security" })], pulls: [pr({})] });
    renderConfigure();

    expect(await screen.findByText("#42 · Fix the thing")).toBeInTheDocument();
    expect(await screen.findByText("Security")).toBeInTheDocument();
    expect(screen.queryByText("Pick a pull request first")).not.toBeInTheDocument();
  });

  it("PR list fails to load: step 1 shows a retry affordance and step 2 stays disabled; retry re-fetches", async () => {
    serve({ pullsError: true });
    renderConfigure();

    expect(await screen.findByText("Couldn’t load pull requests.")).toBeInTheDocument();
    expect(screen.getByText("Pick a pull request first")).toBeInTheDocument();

    serve({ agents: [], pulls: [pr({})] });
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Select a pull request…")).toBeInTheDocument();
  });

  it("clicking an agent card's checkbox toggles it exactly once (not a double-fire no-op)", async () => {
    // Regression: AgentCard used to wrap the Checkbox in its own clickable
    // card div, so a click on the checkbox bubbled into the card's onClick
    // too and toggled twice (checked -> unchecked -> checked again).
    serve({ agents: [agent({ id: "a1", name: "Security" }), agent({ id: "a2", name: "Performance" })], pulls: [pr({})] });
    renderConfigure();

    await userEvent.click(screen.getByText("Select a pull request…"));
    await userEvent.click(await screen.findByText("#42 · Fix the thing"));
    await screen.findByText("Security");

    const checkbox = screen.getByRole("checkbox", { name: /Security/ });
    expect(checkbox).toBeChecked(); // AC-10 default: all enabled agents pre-checked.

    await userEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();

    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it("the pull-request picker is searchable and filters as you type", async () => {
    serve({
      agents: [],
      pulls: [pr({ id: "pr1", number: 42, title: "Fix the thing" }), pr({ id: "pr2", number: 7, title: "Add dark mode" })],
    });
    renderConfigure();

    await userEvent.click(screen.getByText("Select a pull request…"));
    expect(await screen.findByText("#42 · Fix the thing")).toBeInTheDocument();
    expect(screen.getByText("#7 · Add dark mode")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Select a pull request…"), "dark");
    expect(screen.queryByText("#42 · Fix the thing")).not.toBeInTheDocument();
    expect(screen.getByText("#7 · Add dark mode")).toBeInTheDocument();
  });

  it("Select all respects the 8-agent cap", async () => {
    const agents = Array.from({ length: 10 }, (_, i) => agent({ id: `a${i}`, name: `Agent ${i}` }));
    serve({ agents, pulls: [pr({})] });
    renderConfigure();

    await userEvent.click(screen.getByText("Select a pull request…"));
    await userEvent.click(await screen.findByText("#42 · Fix the thing"));
    await screen.findByText("Agent 0");

    await userEvent.click(screen.getByRole("button", { name: "Select all" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Run multi-agent review (8)" })).toBeInTheDocument(),
    );
  });
});
