import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import type { PrMeta } from "@/lib/types";
import type { ReviewRecord } from "@devdigest/shared";
import { FindingsSummary } from "./FindingsSummary";

let reviews: ReviewRecord[] | undefined;
const usePrReviews = vi.fn((_prId: string | null) => ({ data: reviews }));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: (prId: string | null) => usePrReviews(prId),
}));

afterEach(() => {
  cleanup();
  reviews = undefined;
  usePrReviews.mockClear();
});

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "a1b2c3d",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: null,
    updated_at: "2026-09-17T18:44:34.000Z",
    score: 61,
    cost_usd: 0.014,
    findings: { critical: 1, warning: 1, suggestion: 0 },
    ...o,
  };
}

const REVIEW: ReviewRecord = {
  id: "r1",
  pr_id: "pr-1",
  agent_id: "a1",
  run_id: "run1",
  agent_name: "Security Reviewer",
  kind: "review",
  verdict: "request_changes",
  summary: null,
  score: 38,
  model: "deepseek-v4",
  created_at: "2026-09-18T08:52:51.000Z",
  findings: [
    {
      id: "f1",
      severity: "CRITICAL",
      category: "security",
      title: "Hardcoded Stripe secret key",
      file: "src/config.ts",
      start_line: 12,
      end_line: 12,
      rationale: "A live key is committed.",
      suggestion: null,
      confidence: 0.98,
      kind: "finding",
      trifecta_components: null,
      evidence: null,
      review_id: "r1",
      accepted_at: null,
      dismissed_at: null,
    },
  ],
};

describe("FindingsSummary", () => {
  it("shows a dash for a PR that was never reviewed", () => {
    render(<FindingsSummary pr={pr({ findings: null })} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows a clean-PR message when reviewed with zero findings", () => {
    render(<FindingsSummary pr={pr({ findings: { critical: 0, warning: 0, suggestion: 0 } })} />);
    expect(screen.getByText("0 findings")).toBeInTheDocument();
  });

  it("shows an icon+count severity breakdown from PrMeta.findings without fetching reviews first", () => {
    render(<FindingsSummary pr={pr({})} />);
    const trigger = screen.getByRole("button", { name: "Findings by severity" });
    expect(within(trigger).getAllByText("1")).toHaveLength(2); // one count per present severity
    // the reviews query is disabled (prId null) until the popover opens
    expect(usePrReviews).toHaveBeenLastCalledWith(null);
  });

  it("only fetches reviews once the popover opens (hover), and passes its findings through", () => {
    reviews = [REVIEW];
    render(<FindingsSummary pr={pr({})} />);
    const trigger = screen.getByRole("button", { name: "Findings by severity" });
    fireEvent.mouseEnter(trigger.parentElement!);
    expect(usePrReviews).toHaveBeenLastCalledWith("pr-1");
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
  });
});
