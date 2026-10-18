/* MultiAgentLanding — AC-36a: zero enabled agents renders the design's empty
   state; one or more enabled agents redirects to Configure run instead. */
import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { api } from "@/lib/api";
import type { Agent } from "@devdigest/shared";
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

describe("MultiAgentLanding (AC-36a)", () => {
  it("zero enabled agents renders the empty state with a working 'Go to Agents' button", async () => {
    get.mockResolvedValue([agent({ enabled: false })] as never);
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

  it("one or more enabled agents redirects straight to Configure run, never rendering the empty state", async () => {
    get.mockResolvedValue([agent({ enabled: true })] as never);
    renderLanding();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/multi-agent-review/configure"));
    expect(screen.queryByText("Enable agents to run reviews")).not.toBeInTheDocument();
  });
});
