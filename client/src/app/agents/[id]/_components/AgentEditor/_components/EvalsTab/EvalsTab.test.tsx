import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, waitFor, within, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const apiDel = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: apiGet, post: apiPost, put: vi.fn(), del: apiDel },
}));

import { ApiError } from "@/lib/api";
import type { EvalAgentRun, EvalCase, EvalCaseResult, EvalCaseSummary, ExpectedItem } from "@/lib/hooks/eval";
import { EvalsTab } from "./EvalsTab";

const AGENT = { id: "ag1", name: "Security Reviewer", provider: "openai", model: "gpt-4.1" } as Agent;

const result = (o: Partial<EvalCaseResult>): EvalCaseResult => ({
  id: "res",
  case_id: "c",
  eval_run_id: null,
  status: "passed",
  ran_at: "2026-01-01T00:00:00Z",
  finished_at: "2026-01-01T00:00:05Z",
  expected_count: 1,
  got_count: 1,
  kept_count: 1,
  dropped_count: 0,
  duration_ms: 1000,
  cost_usd: 0.01,
  error_reason: null,
  ...o,
});
const mustFind = (o: Partial<ExpectedItem> = {}): ExpectedItem => ({ expect: "must_find", file: "a.ts", start_line: 1, ...o });
const kase = (o: Partial<EvalCaseSummary> & { id: string; name: string }): EvalCaseSummary => ({
  agent_id: "ag1",
  origin: "finding",
  input_meta: { title: "", body: "" },
  expected_output: [mustFind()],
  notes: null,
  source_finding_id: null,
  source_pr_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  latest_result: null,
  ...o,
});
const run = (o: Partial<EvalAgentRun> & { id: string }): EvalAgentRun => ({
  agent_id: "ag1",
  agent_version: 1,
  provider: "openai",
  model: "gpt-4.1",
  strategy: "single-pass",
  skill_ids: [],
  status: "done",
  reason: null,
  started_at: "2026-01-01T00:00:00Z",
  finished_at: "2026-01-01T00:01:00Z",
  cases_total: 3,
  cases_executed: 3,
  cases_errored: 0,
  cases_passed: 2,
  recall: 0.8,
  precision: 0.5,
  citation_accuracy: null,
  cost_usd: 0.1,
  duration_ms: 1000,
  ...o,
});

/** Mutable fake of the API state the tab reads. */
let cases: EvalCaseSummary[];
let runs: EvalAgentRun[];
let runDetail: unknown;

beforeEach(() => {
  cases = [];
  runs = [];
  runDetail = null;
  apiGet.mockImplementation(async (path: string) => {
    if (path === "/agents/ag1/eval-cases") return cases;
    if (path === "/agents/ag1/eval-runs") return runs;
    if (path.startsWith("/eval-runs/")) return runDetail;
    if (path.startsWith("/eval-cases/")) {
      const c = cases.find((x) => path === `/eval-cases/${x.id}`)!;
      return { ...c, input_diff: "--- a/a.ts\n+++ b/a.ts\n@@ -1,1 +1,1 @@\n+x" } satisfies EvalCase;
    }
    throw new Error(`unexpected GET ${path}`);
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  apiGet.mockReset();
  apiPost.mockReset();
  apiDel.mockReset();
});

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  renderWithIntl(
    <QueryClientProvider client={qc}>
      <EvalsTab agent={AGENT} />
    </QueryClientProvider>,
  );
}
const rowOf = (name: string) => screen.getByText(name).closest("[data-status]") as HTMLElement;

describe("agent EvalsTab", () => {
  it("renders case rows with labels, status text and the passing badge, plus metric cards with deltas and no-data dashes", async () => {
    // Catches: wrong chip logic (manual / empty [] / must not flag / no chip), "x / y passing" miscounts,
    // deltas against the wrong run, a null metric rendered as 0%, missing sr-only up/down words (P1-AC-24/25).
    cases = [
      kase({ id: "c1", name: "stripe-key-leak", expected_output: [mustFind({ severity: "CRITICAL", category: "security" })], latest_result: result({ status: "passed", expected_count: 1, got_count: 1 }) }),
      kase({ id: "c2", name: "manual-case", origin: "manual", expected_output: [], latest_result: result({ status: "failed", expected_count: 0, got_count: 2 }) }),
      kase({ id: "c3", name: "no-false-positive", expected_output: [mustFind({ expect: "must_not_flag" })] }),
      kase({ id: "c4", name: "bare-expectation", latest_result: result({ status: "error", error_reason: "missing_api_key" }) }),
    ];
    runs = [
      run({ id: "r3", status: "failed", recall: null, precision: null, citation_accuracy: null, cases_passed: 0 }),
      run({ id: "r2", recall: 0.8, precision: 0.5, citation_accuracy: null, cases_passed: 2, cases_total: 3 }),
      run({ id: "r1", recall: 0.6, precision: 0.7, citation_accuracy: 0.9 }),
    ];
    mount();

    expect(await screen.findByText("stripe-key-leak")).toBeInTheDocument();
    expect(screen.getByText("1 / 4 passing")).toBeInTheDocument();

    const r1 = within(rowOf("stripe-key-leak"));
    expect(rowOf("stripe-key-leak")).toHaveAttribute("data-status", "passed");
    expect(r1.getByText("expected 1 finding, got 1")).toBeInTheDocument();
    expect(r1.getByText("CRITICAL · security")).toBeInTheDocument();
    expect(r1.queryByText("manual")).not.toBeInTheDocument();

    const r2 = within(rowOf("manual-case"));
    expect(rowOf("manual-case")).toHaveAttribute("data-status", "failed");
    expect(r2.getByText("expected 0 findings, got 2")).toBeInTheDocument();
    expect(r2.getByText("manual")).toBeInTheDocument();
    expect(r2.getByText("empty []")).toBeInTheDocument();

    const r3 = within(rowOf("no-false-positive"));
    expect(r3.getByText("never run")).toBeInTheDocument();
    expect(r3.getByText("must not flag")).toBeInTheDocument();

    const r4 = within(rowOf("bare-expectation"));
    expect(rowOf("bare-expectation")).toHaveAttribute("data-status", "error");
    expect(r4.getByText("errored · no API key")).toBeInTheDocument();
    // No severity and no category => no label chip at all (row text is just name + sub-line).
    expect(rowOf("bare-expectation")).toHaveTextContent(/^bare-expectationerrored · no API key$/);
    expect(r4.queryByText("manual")).not.toBeInTheDocument();

    // Metrics come from r2 (latest FINISHED; failed r3 skipped), delta vs r1.
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    const recall = screen.getByText("RECALL").parentElement!;
    expect(recall).toHaveTextContent("▲up 20pt");
    const precision = screen.getByText("PRECISION").parentElement!;
    expect(precision).toHaveTextContent("▼down 20pt");
    const citation = screen.getByText("CITATION ACCURACY").parentElement!;
    expect(within(citation).getByLabelText("no data")).toHaveTextContent("—");
    expect(citation).not.toHaveTextContent(/pt/);
    expect(screen.getByText("TRACES PASSED").parentElement).toHaveTextContent("2/3");
    expect(screen.queryByText("Run all evals to get metrics")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View full dashboard →" })).toHaveAttribute("href", "/eval/ag1");
  });

  it("shows the empty state, the metrics hint and a disabled Run all when the agent has no cases or runs", async () => {
    // Catches: blank tab for a new agent (P1-E-1) and Run all being clickable with nothing to run.
    mount();
    expect(await screen.findByText(/No eval cases yet/)).toBeInTheDocument();
    expect(screen.getByText("Run all evals to get metrics")).toBeInTheDocument();
    expect(screen.getAllByLabelText("no data").length).toBe(4);
    expect(screen.queryByText(/passing/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run all evals" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "New eval case" })).toBeEnabled();
  });

  it("shows 'Running… k/N' from the active run's progress with the button disabled", async () => {
    // Catches: double-starting a run (server 409) and progress not reflecting the polled run detail.
    cases = [kase({ id: "c1", name: "case-one" })];
    runs = [run({ id: "run9", status: "running", cases_total: 3, cases_executed: 0, recall: null, precision: null, citation_accuracy: null })];
    runDetail = { run: { ...runs[0], system_prompt: "" }, progress: { done: 1, total: 3 }, cases: [] };
    mount();
    const btn = await screen.findByRole("button", { name: "Running… 1/3" });
    expect(btn).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Run all evals" })).not.toBeInTheDocument();
  });

  it("tells the user which provider key is missing when the newest run failed with missing_api_key", async () => {
    // Catches: a silent failed run — the one actionable reason must be shown (plan 1.19).
    cases = [kase({ id: "c1", name: "case-one" })];
    runs = [run({ id: "r1", status: "failed", reason: "missing_api_key", recall: null, precision: null, citation_accuracy: null })];
    mount();
    expect(await screen.findByText("No API key for openai")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run all evals" })).toBeEnabled();
  });

  it("row Run posts for that case, shows Running…, then the new status after the 2s poll", async () => {
    // Catches: Run click not reaching the API, row never leaving running (P1-AC-18 refresh <= 5 s),
    // and polling not started for a running row.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    cases = [kase({ id: "c1", name: "case-one", latest_result: result({ status: "failed", expected_count: 1, got_count: 0 }) })];
    mount();
    expect(await screen.findByText("expected 1 finding, got 0")).toBeInTheDocument();

    apiPost.mockImplementation(async () => {
      cases = [kase({ id: "c1", name: "case-one", latest_result: result({ status: "running", finished_at: null, expected_count: null, got_count: null }) })];
      return { result_id: "res2" };
    });
    await userEvent.click(screen.getByRole("button", { name: "Run case-one" }));
    expect(apiPost).toHaveBeenCalledWith("/eval-cases/c1/run");
    await waitFor(() => expect(rowOf("case-one")).toHaveAttribute("data-status", "running"));
    expect(within(rowOf("case-one")).getByText("Running…")).toBeInTheDocument();

    cases = [kase({ id: "c1", name: "case-one", latest_result: result({ status: "passed", expected_count: 1, got_count: 1 }) })];
    await act(() => vi.advanceTimersByTimeAsync(2100));
    await waitFor(() => expect(rowOf("case-one")).toHaveAttribute("data-status", "passed"));
    expect(within(rowOf("case-one")).getByText("expected 1 finding, got 1")).toBeInTheDocument();
  });

  it("case rows leave 'never run' for their failed state when the Run all run finishes (B-1)", async () => {
    // Catches B-1: rows stuck on "never run" after Run all completed, because the case list was only
    // refreshed by useEvalRun, which RunAllEvalsButton disables once the polled run list has no running run.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    cases = [kase({ id: "c1", name: "case-one" })];
    runs = [run({ id: "run9", status: "running", cases_total: 1, cases_executed: 0, recall: null, precision: null, citation_accuracy: null })];
    runDetail = { run: { ...runs[0], system_prompt: "" }, progress: { done: 0, total: 1 }, cases: [] };
    mount();
    await screen.findByRole("button", { name: "Running… 0/1" });
    expect(within(rowOf("case-one")).getByText("never run")).toBeInTheDocument();

    // Server finishes. The case list has no running row so it is not polled; only the run list is.
    cases = [kase({ id: "c1", name: "case-one", latest_result: result({ status: "failed", expected_count: 1, got_count: 0 }) })];
    runs = [run({ id: "run9", status: "done", cases_total: 1, cases_executed: 1, cases_passed: 0 })];
    await act(() => vi.advanceTimersByTimeAsync(2100));
    await waitFor(() => expect(rowOf("case-one")).toHaveAttribute("data-status", "failed"));
    expect(within(rowOf("case-one")).getByText("expected 1 finding, got 0")).toBeInTheDocument();
    expect(within(rowOf("case-one")).queryByText("never run")).not.toBeInTheDocument();
  });

  it("toasts the coded reason when a row Run is rejected (409), and delete asks for confirmation before calling the API", async () => {
    // Catches: swallowed run errors, and a delete firing without the confirm step (destructive, removes history).
    cases = [kase({ id: "c1", name: "case-one" })];
    mount();
    await screen.findByText("case-one");

    apiPost.mockRejectedValueOnce(new ApiError("busy", 409, "eval_case_running"));
    await userEvent.click(screen.getByRole("button", { name: "Run case-one" }));
    expect(await screen.findByText("This case is already running")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Delete case-one" }));
    expect(apiDel).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Delete “case-one”?");
    apiDel.mockResolvedValue({ ok: true });
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(apiDel).toHaveBeenCalledWith("/eval-cases/c1"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("Edit opens the case modal for that case", async () => {
    // Catches: Edit wired to the wrong case id / modal not opening in edit mode.
    cases = [kase({ id: "c1", name: "case-one" })];
    mount();
    await userEvent.click(await screen.findByRole("button", { name: "Edit case-one" }));
    expect(await screen.findByRole("dialog", { name: "Eval case · case-one" })).toBeInTheDocument();
  });
});
