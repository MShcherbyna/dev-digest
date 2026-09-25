import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiffResponse } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";

const mutate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePrSmartDiff: () => ({ data: SMART_DIFF }),
  usePrReviews: () => ({ data: REVIEWS }),
  useFindingAction: () => ({ mutate, isPending: false }),
}));
vi.mock("@/lib/hooks/translation", () => ({
  useTranslateFinding: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

import { DiffTab } from "./DiffTab";

const CORE_PATCH = "@@ -1,3 +1,3 @@\n line1\n+line2\n line3";

const FILES: PrFile[] = [
  { path: "src/core.ts", additions: 1, deletions: 0, patch: CORE_PATCH },
  { path: "README.md", additions: 1, deletions: 0, patch: "" },
];

const SMART_DIFF: SmartDiffResponse = {
  groups: [
    {
      role: "core",
      files: [{ path: "src/core.ts", additions: 1, deletions: 0, pseudocode_summary: null, finding_lines: [2] }],
    },
    {
      role: "docs",
      files: [{ path: "README.md", additions: 1, deletions: 0, pseudocode_summary: null, finding_lines: [] }],
    },
  ],
  split_suggestion: { too_big: false, total_lines: 2, proposed_splits: [] },
};

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "bug",
  title: "A finding",
  file: "src/core.ts",
  start_line: 2,
  end_line: 2,
  rationale: "r",
  confidence: 0.9,
  kind: "finding",
  review_id: "rev1",
  accepted_at: null,
  dismissed_at: null,
};

const REVIEWS: ReviewRecord[] = [
  {
    id: "rev1",
    pr_id: "pr1",
    agent_id: null,
    run_id: null,
    agent_name: "Agent",
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at: "2026-01-01T00:00:00Z",
    findings: [FINDING],
  },
];

afterEach(() => {
  cleanup();
  mutate.mockReset();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("DiffTab", () => {
  it("shows grouped headers in Smart order, switches to Original order and back, and accepts an inline finding", () => {
    renderWithIntl(
      <DiffTab prId="pr1" filesCount={FILES.length} files={FILES} repoFullName="acme/repo" headSha="sha1" />,
    );

    // Smart order: group headers are present.
    expect(screen.getByRole("button", { name: /Core logic/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Docs/ })).toBeInTheDocument();

    // The finding is anchored under line 2 and rendered via the injected FindingCard.
    expect(screen.getByText("A finding")).toBeInTheDocument();

    // Switch to Original order: group headers disappear, files list flat.
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    expect(screen.queryByRole("button", { name: /Core logic/ })).not.toBeInTheDocument();
    expect(screen.getByText("src/core.ts")).toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();

    // Switch back to Smart order: group headers reappear.
    fireEvent.click(screen.getByRole("button", { name: "Smart order" }));
    expect(screen.getByRole("button", { name: /Core logic/ })).toBeInTheDocument();

    // Accept the inline finding.
    fireEvent.click(screen.getByText("Accept"));
    expect(mutate).toHaveBeenCalledWith({ findingId: "f1", action: "accept", prId: "pr1" });
  });
});
