import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

const createCase = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hooks/eval", () => ({
  useCreateCaseFromFinding: () => ({ mutate: createCase, isPending: false }),
}));
vi.mock("@/lib/hooks/translation", () => ({
  useTranslateFinding: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));
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

import { ToastProvider } from "@/lib/toast";
import { FindingsPanel } from "./FindingsPanel";

afterEach(() => {
  cleanup();
  createCase.mockReset();
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
      <ToastProvider>{ui}</ToastProvider>
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

describe("FindingsPanel translation", () => {
  it("has no toolbar Translate button (translation is per finding, in the card actions)", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    // The first card is expanded: its actions row carries the single Translate button.
    expect(screen.getAllByRole("button", { name: "Translate" })).toHaveLength(1);
  });
});

describe("FindingsPanel eval-case action", () => {
  it("threads prId/agentId into the card: undecided is disabled, decided creates a case and links to that agent's Evals tab, eval_case_id shows 'In eval set'", () => {
    // Catches: callers (panel -> card) dropping prId (button missing) or agentId (toast link to the wrong/no agent).
    createCase.mockImplementation((_id: string, opts: { onSuccess: () => void }) => opts.onSuccess());
    const { rerender } = renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" agentId="ag9" />);
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeDisabled();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <ToastProvider>
          <FindingsPanel findings={[finding({ accepted_at: "2026-01-01T00:00:00Z" })]} prId="pr1" agentId="ag9" />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(createCase).toHaveBeenCalledWith("f1", expect.anything());
    expect(screen.getByRole("link", { name: "View in Evals" })).toHaveAttribute("href", "/agents/ag9?tab=evals");
    expect(screen.getByRole("button", { name: "In eval set" })).toBeDisabled();
  });

  it("a finding that already has eval_case_id renders 'In eval set' disabled", () => {
    // Catches: eval_case_id from the reviews payload not reaching the button (duplicate-case clicks).
    renderWithIntl(
      <FindingsPanel findings={[{ ...finding({ dismissed_at: "2026-01-01T00:00:00Z" }), eval_case_id: "case1" }]} prId="pr1" />,
    );
    expect(screen.getByRole("button", { name: "In eval set" })).toBeDisabled();
  });
});
