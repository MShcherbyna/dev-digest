import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("@/lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

let searchParams = new URLSearchParams();
const replace = vi.fn((url: string) => {
  searchParams = new URLSearchParams(url.split("?")[1] ?? "");
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/repos/repo-1/pulls/482",
  useSearchParams: () => searchParams,
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(() => {
  cleanup();
  searchParams = new URLSearchParams();
  replace.mockClear();
});

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

const FINDINGS: FindingRecord[] = [finding({})];

const MIXED_FINDINGS: FindingRecord[] = [
  finding({ id: "f1", severity: "CRITICAL", title: "Hardcoded secret" }),
  finding({ id: "f2", severity: "WARNING", title: "N+1 query", category: "perf" }),
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });

  it("clicking a severity chip sets the URL filter", () => {
    renderWithIntl(<FindingsPanel findings={MIXED_FINDINGS} prId="pr1" />);
    fireEvent.click(screen.getByText("Critical"));
    expect(searchParams.get("severity")).toBe("CRITICAL");
  });

  it("clicking the already-active severity chip clears the filter", () => {
    searchParams = new URLSearchParams("severity=CRITICAL");
    renderWithIntl(<FindingsPanel findings={MIXED_FINDINGS} prId="pr1" />);
    fireEvent.click(screen.getByText("Critical"));
    expect(searchParams.get("severity")).toBeNull();
  });

  it("pre-filters to the severity given in the URL (deep-link from the PR list)", () => {
    searchParams = new URLSearchParams("severity=WARNING");
    renderWithIntl(<FindingsPanel findings={MIXED_FINDINGS} prId="pr1" />);
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });

  it("shows a read-only counts row (only present severities) separate from the 3 filter buttons", () => {
    renderWithIntl(<FindingsPanel findings={MIXED_FINDINGS} prId="pr1" />);
    // counts row: "1 CRITICAL · 1 WARNING" (no SUGGESTION — none present)
    expect(screen.getByText("1 CRITICAL")).toBeInTheDocument();
    expect(screen.getByText("1 WARNING")).toBeInTheDocument();
    // filter row always has all 3 buttons, regardless of which severities are present
    expect(screen.getByRole("button", { name: "Critical" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Warning" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suggestion" })).toBeInTheDocument();
  });
});
