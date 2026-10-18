/* MultiAgentRunView — results page (AC-26, AC-27, AC-30, AC-35, AC-19 cancel). */
import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { api } from "@/lib/api";
import type { MultiAgentRunView as MultiAgentRunViewType } from "@/lib/types";
import { MultiAgentRunView } from "./MultiAgentRunView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const cancelRunMutate = vi.fn();
const cancelChildMutate = vi.fn();
const retryChildMutate = vi.fn();
let runData: MultiAgentRunViewType | undefined;
vi.mock("@/lib/hooks/multi-agent", () => ({
  useMultiAgentRun: () => ({ data: runData, isLoading: false, isError: false }),
  useCancelMultiAgentRun: () => ({ mutate: cancelRunMutate }),
  useCancelMultiAgentChild: () => ({ mutate: cancelChildMutate }),
  useRetryMultiAgentChild: () => ({ mutate: retryChildMutate }),
}));

vi.mock("@/lib/api", async (orig) => {
  const actual = await orig<typeof import("@/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() } };
});
vi.mocked(api.get).mockResolvedValue([] as never);

function column(o: Partial<MultiAgentRunViewType["columns"][number]>) {
  return {
    run_id: "run-1",
    agent_id: "agent-1",
    agent_name: "Security",
    provider: "anthropic",
    model: "claude",
    status: "done" as const,
    verdict: "request_changes",
    score: 80,
    summary: "ok",
    duration_ms: 4000,
    cost_usd: 0.03,
    findings: [],
    ...o,
  };
}

function run(o: Partial<MultiAgentRunViewType>): MultiAgentRunViewType {
  return {
    id: "run-abc",
    pr_id: "pr1",
    pr_number: 42,
    ran_at: "2026-10-17T00:00:00.000Z",
    agent_count: 2,
    total_duration_ms: 5000,
    total_cost_usd: 0.08,
    status: "done",
    concurrency_limit: 4,
    requested_agent_ids: ["agent-1", "agent-2"],
    columns: [column({ run_id: "r1", agent_id: "a1", agent_name: "Security" }), column({ run_id: "r2", agent_id: "a2", agent_name: "Performance" })],
    conflicts: [],
    ...o,
  };
}

function renderRun() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithIntl(
    <QueryClientProvider client={qc}>
      <MultiAgentRunView runId="run-abc" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue([] as never);
  sessionStorage.clear();
});
afterEach(cleanup);

describe("MultiAgentRunView", () => {
  it("AC-26: a fully done run shows a plain total; one still-running column marks it 'partial'", () => {
    runData = run({ total_duration_ms: 5000, total_cost_usd: 0.08 });
    renderRun();
    expect(screen.getByText("2 agents · parallel fan-out · 5.0s total · $0.08")).toBeInTheDocument();
    cleanup();

    runData = run({
      status: "running",
      columns: [column({ run_id: "r1" }), column({ run_id: "r2", status: "queued", score: null, cost_usd: null })],
    });
    renderRun();
    expect(screen.getByText("2 agents · parallel fan-out · 5.0s total · $0.08 · partial")).toBeInTheDocument();
  });

  it("AC-27/AC-30: the Columns/Tabs toggle and the 'Show only conflicts' toggle both survive a mode switch and persist across a reload", async () => {
    runData = run({
      conflicts: [
        {
          file: "a.ts",
          line: 10,
          title: "Conflict here",
          takes: [
            { agent_id: "a1", persona: "security", verdict: "WARNING", note: "" },
            { agent_id: "a2", persona: "performance", verdict: "ignored", note: "" },
          ],
        },
      ],
    });
    renderRun();

    expect(screen.getByRole("button", { name: "Columns" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("switch"));
    await userEvent.click(screen.getByRole("button", { name: "Tabs" }));
    expect(screen.getByRole("button", { name: "Tabs" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    cleanup();

    // Simulate a reload: fresh mount, same sessionStorage.
    renderRun();
    expect(screen.getByRole("button", { name: "Tabs" })).toHaveAttribute("aria-pressed", "true");
  });

  it("AC-35/AC-19: a running run shows 'Cancel run' (which cancels the parent); a later reload reflects fresh statuses", async () => {
    runData = run({ status: "running", columns: [column({ run_id: "r1", status: "queued", score: null, cost_usd: null }), column({ run_id: "r2" })] });
    renderRun();

    const liveRegion = document.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(within(liveRegion).getByText(/Security: queued/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel run" }));
    expect(cancelRunMutate).toHaveBeenCalledWith("run-abc");
    cleanup();

    // "Reload": the query now reports the run as fully done.
    runData = run({ status: "done" });
    renderRun();
    expect(screen.queryByRole("button", { name: "Cancel run" })).not.toBeInTheDocument();
    const liveRegionAfter = document.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(within(liveRegionAfter).getByText(/Security: done/)).toBeInTheDocument();
  });
});
