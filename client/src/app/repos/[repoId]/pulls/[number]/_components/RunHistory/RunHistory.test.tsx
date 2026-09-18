/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { RunHistory } from "./RunHistory";

afterEach(cleanup);

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: null,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    ...o,
  };
}

function renderRuns(runs: RunSummary[], reviews: ReviewRecord[] = []) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} reviews={reviews} onOpenTrace={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("shows a severity breakdown + hover popover (like the PR list) when a matching review is loaded", () => {
    const review: ReviewRecord = {
      id: "rev-1",
      pr_id: "pr-1",
      agent_id: "a1",
      run_id: "run-1",
      agent_name: "Security Reviewer",
      kind: "review",
      verdict: "request_changes",
      summary: null,
      score: 17,
      model: "claude-sonnet-4-6",
      created_at: "2026-09-18T12:52:52.000Z",
      findings: [
        {
          id: "f1",
          severity: "CRITICAL",
          category: "security",
          title: "SSRF via unvalidated webhook URL",
          file: "src/webhooks.ts",
          start_line: 61,
          end_line: 74,
          rationale: "The callback_url is fetched without an allowlist.",
          suggestion: null,
          confidence: 0.9,
          kind: "finding",
          trifecta_components: null,
          evidence: null,
          review_id: "rev-1",
          accepted_at: null,
          dismissed_at: null,
        },
      ],
    };
    renderRuns([run({ status: "done", findings_count: 1, blockers: 1, score: 17 })], [review]);
    // the plain "N finding(s)" fallback text is gone, replaced by the breakdown
    expect(screen.queryByText("1 finding(s)")).not.toBeInTheDocument();
    expect(screen.getByText("1 CRITICAL")).toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByText("1 CRITICAL").closest("div")!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("SSRF via unvalidated webhook URL")).toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});

describe("RunHistory — cost badge (Run Cost Badge)", () => {
  it("a settled run with a known cost shows it formatted next to the timestamp", () => {
    renderRuns([run({ status: "done", cost_usd: 0.014 })]);
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("a settled run with no cost data shows the dash, never $0.00", () => {
    renderRuns([run({ status: "done", cost_usd: null })]);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("a running run shows no cost element at all (not even a dash)", () => {
    renderRuns([run({ status: "running", score: null, blockers: null, cost_usd: null })]);
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("a failed run shows no cost element at all", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null, cost_usd: null })]);
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });
});
