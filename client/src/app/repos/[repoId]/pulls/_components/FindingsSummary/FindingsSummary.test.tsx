import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { PrMeta } from "@/lib/types";
import type { ReviewRecord } from "@devdigest/shared";
import { FindingsSummary } from "./FindingsSummary";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

let reviews: ReviewRecord[] | undefined;
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: reviews }),
}));

afterEach(() => {
  cleanup();
  push.mockClear();
  reviews = undefined;
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
    {
      id: "f2",
      severity: "WARNING",
      category: "perf",
      title: "N+1 query in user list endpoint",
      file: "src/api/users.ts",
      start_line: 45,
      end_line: 52,
      rationale: "Loop calls db.posts.findMany once per user.",
      suggestion: null,
      confidence: 0.86,
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
    render(<FindingsSummary pr={pr({ findings: null })} repoId="repo-1" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows a clean-PR message when reviewed with zero findings", () => {
    render(<FindingsSummary pr={pr({ findings: { critical: 0, warning: 0, suggestion: 0 } })} repoId="repo-1" />);
    expect(screen.getByText("0 findings")).toBeInTheDocument();
  });

  it("shows the severity breakdown and opens a preview popover on hover", () => {
    reviews = [REVIEW];
    render(<FindingsSummary pr={pr({})} repoId="repo-1" />);
    expect(screen.getByText("1 CRITICAL")).toBeInTheDocument();
    expect(screen.getByText("1 WARNING")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByText("1 CRITICAL").closest("div")!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByText("1 CRITICAL").closest("div")!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("clicking the trigger pins the popover open even after the mouse leaves", () => {
    reviews = [REVIEW];
    render(<FindingsSummary pr={pr({})} repoId="repo-1" />);
    const trigger = screen.getByRole("button", { name: "Findings by severity" });
    fireEvent.click(trigger);
    fireEvent.mouseLeave(trigger.parentElement!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("clicking a finding in the popover navigates to the PR detail page filtered to its severity", () => {
    reviews = [REVIEW];
    render(<FindingsSummary pr={pr({})} repoId="repo-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Findings by severity" }));
    fireEvent.click(screen.getByText("N+1 query in user list endpoint"));
    expect(push).toHaveBeenCalledWith("/repos/repo-1/pulls/482?tab=findings&severity=WARNING");
  });
});
