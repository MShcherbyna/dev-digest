import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

const translateMutate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hooks/translation", () => ({
  useTranslateFinding: () => ({ mutate: translateMutate, isPending: false, isError: false }),
}));

import { FindingCard } from "./FindingCard";

afterEach(() => {
  cleanup();
  translateMutate.mockReset();
});

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("fires accept/dismiss actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });
});

describe("FindingCard translation", () => {
  const RESPONSE = {
    language: "uk",
    model: "m",
    finding_id: "f1",
    title: "Захардкоджений секрет",
    rationale: "Секрет у коді.",
    suggestion: null,
  };
  const ok = (_v: unknown, opts: { onSuccess: (r: unknown) => void }) => opts.onSuccess(RESPONSE);

  it("translates this finding from the actions row and toggles back without a new request", () => {
    translateMutate.mockImplementation(ok);
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded />);
    fireEvent.click(screen.getByRole("button", { name: "Translate" }));
    expect(translateMutate).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Захардкоджений секрет")).toBeInTheDocument();
    expect(screen.queryByText(FINDING.title)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show original" }));
    expect(screen.getByText(FINDING.title)).toBeInTheDocument();

    // Translating again reuses the held translation: still one request.
    fireEvent.click(screen.getByRole("button", { name: "Translate" }));
    expect(screen.getByText("Захардкоджений секрет")).toBeInTheDocument();
    expect(translateMutate).toHaveBeenCalledTimes(1);
  });
});
