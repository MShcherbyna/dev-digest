import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";
import { PRRow } from "./PRRow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(cleanup);

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
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
    score: null,
    cost_usd: null,
    ...o,
  };
}

function renderRow(row: PrMeta) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <PRRow pr={row} repoId="repo-1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("PRRow — cost column (Run Cost Badge)", () => {
  it("shows the formatted cost of the latest review's run", () => {
    renderRow(pr({ score: 61, cost_usd: 0.014 }));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows a dash — never $0.00 — for a PR that was never reviewed", () => {
    renderRow(pr({ score: null, cost_usd: null }));
    // the score cell also renders "—" when unreviewed, so both dashes are expected
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("shows a dash for a reviewed PR whose run has no cost data (unpriced model)", () => {
    renderRow(pr({ score: 61, cost_usd: null, findings: { critical: 0, warning: 0, suggestion: 0 } }));
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("PRRow — findings column", () => {
  it("shows a severity breakdown for a reviewed PR", () => {
    renderRow(pr({ score: 61, findings: { critical: 2, warning: 4, suggestion: 0 } }));
    expect(screen.getByText("2 CRITICAL")).toBeInTheDocument();
    expect(screen.getByText("4 WARNING")).toBeInTheDocument();
    // suggestion count is 0 — not rendered as a segment
    expect(screen.queryByText(/SUGGESTION/)).not.toBeInTheDocument();
  });

  it("shows a dash for a PR that was never reviewed (findings absent)", () => {
    renderRow(pr({ score: null, findings: null }));
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("shows a clean-PR message when reviewed with zero findings", () => {
    renderRow(pr({ score: 95, findings: { critical: 0, warning: 0, suggestion: 0 } }));
    expect(screen.getByText("0 findings")).toBeInTheDocument();
  });
});
