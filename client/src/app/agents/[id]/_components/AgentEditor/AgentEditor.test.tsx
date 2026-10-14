import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@/test/user";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import contextMessages from "../../../../../../messages/en/context.json";
import evalMessages from "../../../../../../messages/en/eval.json";
import { ToastProvider } from "@/lib/toast";

const apiGet = vi.hoisted(() => vi.fn());
// The Context tab runs its REAL hooks; only the HTTP boundary and the active repo are mocked.
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: apiGet, put: vi.fn() },
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/api" } }),
}));

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("@/lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

import { AgentEditor } from "./AgentEditor";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });

  it("offers a Skills tab and reports tab changes", async () => {
    const onTab = vi.fn();
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={onTab} />);
    await userEvent.click(screen.getByRole("button", { name: "Skills" }));
    expect(onTab).toHaveBeenCalledWith("skills");
    await userEvent.click(screen.getByRole("button", { name: "Evals" }));
    expect(onTab).toHaveBeenCalledWith("evals");
    await userEvent.click(screen.getByRole("button", { name: "Stats" }));
    expect(onTab).toHaveBeenCalledWith("stats");
  });

  it("tab=context renders the Project context tab and requests the agent's list for the active repo", async () => {
    // Catches: the Context tab unreachable / unwired from the editor, or the container not passing the active repo (AC-37).
    apiGet.mockReset().mockImplementation(async (url: string) => {
      if (url === "/agents/ag1/context?repo_id=r1") return { paths: [] };
      if (url === "/repos/r1/context") return { glob: "g", scanned_at: "2026-10-11T10:00:00Z", cloned: true, truncated: false, total: 0, files: [] };
      throw new Error(`unexpected GET ${url}`);
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <NextIntlClientProvider locale="en" messages={{ agents: messages, context: contextMessages }}>
        <ToastProvider>
          <QueryClientProvider client={qc}>
            <AgentEditor agent={AGENT} tab="context" onTab={() => {}} />
          </QueryClientProvider>
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: "Project context" })).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/agents/ag1/context?repo_id=r1");
  });

  it("tab=evals renders the real Evals tab for this agent and loads its cases and runs", async () => {
    // Catches: the editor still rendering the placeholder, or EvalsTab wired to the wrong agent (cases/runs/dashboard link).
    apiGet.mockReset().mockImplementation(async (url: string) => {
      if (url === "/agents/ag1/eval-cases" || url === "/agents/ag1/eval-runs") return [];
      throw new Error(`unexpected GET ${url}`);
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <NextIntlClientProvider locale="en" messages={{ agents: messages, eval: evalMessages }}>
        <ToastProvider>
          <QueryClientProvider client={qc}>
            <AgentEditor agent={AGENT} tab="evals" onTab={() => {}} />
          </QueryClientProvider>
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: "Eval cases" })).toBeInTheDocument();
    expect(screen.queryByText("Evals are coming soon")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View full dashboard →" })).toHaveAttribute("href", "/eval/ag1");
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/agents/ag1/eval-cases"));
    expect(apiGet).toHaveBeenCalledWith("/agents/ag1/eval-runs");
  });
});
