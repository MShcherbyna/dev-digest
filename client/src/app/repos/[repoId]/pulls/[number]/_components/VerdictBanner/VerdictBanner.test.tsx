import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import { VerdictBanner } from "./VerdictBanner";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("VerdictBanner (smoke)", () => {
  it("shows verdict label + score + finding/blocker counts", () => {
    renderWithIntl(
      <VerdictBanner
        verdict="request_changes"
        summary="Hardcoded secret introduced."
        score={42}
        findingsCount={1}
        blockers={1}
        agentName="Security Reviewer"
      />,
    );
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/1 findings · 1 blockers/)).toBeInTheDocument();
  });

  // Catches: the PR Brief's optional slots leaking into the Agent runs tab (R3) - without
  // info/action/scoreFooter the banner has no interactive element, no cost line and no score
  // column footer, i.e. exactly the pre-brief DOM.
  it("regression (Agent runs): without the new props there is no refresh, ⓘ or cost - and they appear only when passed", () => {
    const base = { verdict: "request_changes" as const, summary: "S", score: 42, findingsCount: 1, blockers: 1, agentName: "Sec" };
    const { container, unmount } = renderWithIntl(<VerdictBanner {...base} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    const plain = container.innerHTML;
    unmount();

    // explicit undefined for every new prop is identical to omitting them
    const again = renderWithIntl(<VerdictBanner {...base} info={undefined} action={undefined} scoreFooter={undefined} />);
    expect(again.container.innerHTML).toBe(plain);
    again.unmount();

    renderWithIntl(
      <VerdictBanner
        {...base}
        info={<button aria-label="why">i</button>}
        action={<button>refresh</button>}
        scoreFooter={<span>$0.014</span>}
      />,
    );
    expect(screen.getByRole("button", { name: "why" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "refresh" })).toBeInTheDocument();
    expect(screen.getByText("$0.014")).toBeInTheDocument();
    // ⓘ sits right after the counts badge, before the agent badge
    const counts = screen.getByText(/1 findings · 1 blockers/);
    expect(counts.nextElementSibling).toBe(screen.getByRole("button", { name: "why" }));
  });

  // Catches: summary-only mode (PR Brief with no review) rendering a verdict label, counts or a
  // score ring; and the score column dropping the footer when there is no score.
  it("verdict=null is summary-only; a footer alone still renders its column without a score", () => {
    renderWithIntl(
      <VerdictBanner verdict={null} summary="Only a summary" score={61} findingsCount={0} blockers={0} scoreFooter={<span>$0.01</span>} />,
    );
    expect(screen.getByText("Only a summary")).toBeInTheDocument();
    expect(screen.queryByText("Comment")).not.toBeInTheDocument();
    expect(screen.queryByText(/findings/)).not.toBeInTheDocument();
    expect(screen.queryByText("61")).not.toBeInTheDocument();
    expect(screen.queryByText("PR SCORE")).not.toBeInTheDocument();
    expect(screen.getByText("$0.01")).toBeInTheDocument();
  });

  // Catches: null score rendering a score ring, null summary rendering an empty
  // paragraph, zero blockers still printing the blockers suffix, or a missing
  // agent name rendering an empty agent badge.
  it("empty state: no summary, score, blockers or agent renders only label + count", () => {
    renderWithIntl(
      <VerdictBanner verdict="comment" summary={null} score={null} findingsCount={0} blockers={0} />,
    );
    expect(screen.getByText("Comment")).toBeInTheDocument();
    expect(screen.getByText("0 findings")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
    expect(screen.queryByText("PR SCORE")).not.toBeInTheDocument();
    expect(screen.queryByRole("paragraph")).not.toBeInTheDocument();
  });
});
