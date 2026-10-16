import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
vi.mock("../api", async (orig) => ({
  ...(await orig<typeof import("../api")>()),
  api: { get, post, put: vi.fn(), del: vi.fn() },
}));

import { ApiError } from "../api";
import { EVAL_POLL_MS, useAgentEvalRuns, useCreateCaseFromFinding, useEvalCases, useEvalRun, useRunEvalCase } from "./eval";

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, spy, wrapper };
}
const caseWith = (status: string) => [{ id: "c1", latest_result: { status } }];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  get.mockReset();
  post.mockReset();
});

describe("eval hooks", () => {
  it("useEvalCases polls every 2s while a case is running and stops once it is not", async () => {
    // Catches: a stuck "running" row that never refreshes (P1-AC-18, <= 5 s) or polling forever after completion.
    get.mockResolvedValueOnce(caseWith("running")).mockResolvedValueOnce(caseWith("passed")).mockResolvedValue(caseWith("passed"));
    const { wrapper } = setup();
    const { result } = renderHook(() => useEvalCases("ag1"), { wrapper });
    await waitFor(() => expect(result.current.data?.[0]?.latest_result?.status).toBe("running"));
    expect(get).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(EVAL_POLL_MS + 50));
    await waitFor(() => expect(result.current.data?.[0]?.latest_result?.status).toBe("passed"));
    expect(get).toHaveBeenCalledTimes(2);

    await act(() => vi.advanceTimersByTimeAsync(EVAL_POLL_MS * 3));
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("useEvalRun refreshes the case list and run list once the run stops running, not before", async () => {
    // Catches: metrics/rows staying stale after "Run all" finishes (P1-AC-18).
    const detail = (status: string) => ({ run: { id: "run1", status }, progress: { done: 1, total: 2 }, cases: [] });
    get.mockResolvedValueOnce(detail("running")).mockResolvedValue(detail("done"));
    const { wrapper, spy } = setup();
    const { result } = renderHook(() => useEvalRun("run1", "ag1"), { wrapper });
    await waitFor(() => expect(result.current.data?.run.status).toBe("running"));
    expect(spy).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(EVAL_POLL_MS + 50));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["eval-cases", "ag1"] }));
    expect(spy).toHaveBeenCalledWith({ queryKey: ["agent-eval-runs", "ag1"] });
  });

  it("useAgentEvalRuns refreshes the case list when the run list flips running -> done, with no useEvalRun mounted", async () => {
    // Catches B-1: after "Run all" finished, case rows stayed "never run" until reload because the only
    // invalidation lived in useEvalRun, whose query is disabled once no run is "running".
    let runStatus = "running";
    let caseStatus: string | null = null;
    get.mockImplementation(async (path: string) => {
      if (path === "/agents/ag1/eval-runs") return [{ id: "run1", status: runStatus }];
      if (path === "/agents/ag1/eval-cases") return [{ id: "c1", latest_result: caseStatus ? { status: caseStatus } : null }];
      throw new Error(`unexpected GET ${path}`);
    });
    const { wrapper, spy } = setup();
    const { result } = renderHook(() => ({ runs: useAgentEvalRuns("ag1"), cases: useEvalCases("ag1") }), { wrapper });
    await waitFor(() => expect(result.current.runs.data?.[0]?.status).toBe("running"));
    await waitFor(() => expect(result.current.cases.data).toBeDefined());
    expect(result.current.cases.data?.[0]?.latest_result).toBeNull();
    const caseGets = () => get.mock.calls.filter(([p]) => p === "/agents/ag1/eval-cases").length;
    expect(caseGets()).toBe(1);
    expect(spy).not.toHaveBeenCalled();

    runStatus = "done";
    caseStatus = "failed";
    await act(() => vi.advanceTimersByTimeAsync(EVAL_POLL_MS + 50));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["eval-cases", "ag1"] }));
    await waitFor(() => expect(result.current.cases.data?.[0]?.latest_result?.status).toBe("failed"));
    expect(caseGets()).toBe(2);
  });

  it("useAgentEvalRuns does not invalidate the case list while a run stays running or when it was never seen running", async () => {
    // Catches: refetch storms on every poll tick / on first load of an agent whose runs are all finished.
    get.mockResolvedValue([{ id: "run1", status: "done" }]);
    const first = setup();
    const done = renderHook(() => useAgentEvalRuns("ag1"), { wrapper: first.wrapper });
    await waitFor(() => expect(done.result.current.data).toBeDefined());
    await act(() => vi.advanceTimersByTimeAsync(EVAL_POLL_MS * 2));
    expect(first.spy).not.toHaveBeenCalled();
    done.unmount();

    get.mockReset();
    get.mockResolvedValue([{ id: "run1", status: "running" }]);
    const second = setup();
    const running = renderHook(() => useAgentEvalRuns("ag1"), { wrapper: second.wrapper });
    await waitFor(() => expect(running.result.current.data).toBeDefined());
    await act(() => vi.advanceTimersByTimeAsync(EVAL_POLL_MS * 2 + 50));
    expect(get.mock.calls.length).toBeGreaterThan(1);
    expect(second.spy).not.toHaveBeenCalled();
  });

  it("useRunEvalCase posts to the case run endpoint and invalidates the list and the case", async () => {
    // Catches: row not entering the running state after clicking Run (list never refetched).
    post.mockResolvedValue({ result_id: "res1" });
    const { wrapper, spy } = setup();
    const { result } = renderHook(() => useRunEvalCase("ag1"), { wrapper });
    await act(() => result.current.mutateAsync("c1"));
    expect(post).toHaveBeenCalledWith("/eval-cases/c1/run");
    expect(spy).toHaveBeenCalledWith({ queryKey: ["eval-cases", "ag1"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["eval-case", "c1"] });
  });

  it("useCreateCaseFromFinding invalidates the PR's reviews on 201 and 409 but not on other errors", async () => {
    // Catches: eval_case_id never appearing after create / after a duplicate (409), or refetch storms on 422.
    const { wrapper, spy } = setup();
    const { result } = renderHook(() => useCreateCaseFromFinding("pr1"), { wrapper });

    post.mockResolvedValueOnce({ id: "case1" });
    await act(() => result.current.mutateAsync("f1"));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith({ queryKey: ["reviews", "pr1"] });

    post.mockRejectedValueOnce(new ApiError("dup", 409, "eval_case_exists"));
    await act(() => result.current.mutateAsync("f1").catch(() => undefined));
    expect(spy).toHaveBeenCalledTimes(2);

    post.mockRejectedValueOnce(new ApiError("bad", 422, "undecided"));
    await act(() => result.current.mutateAsync("f1").catch(() => undefined));
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
