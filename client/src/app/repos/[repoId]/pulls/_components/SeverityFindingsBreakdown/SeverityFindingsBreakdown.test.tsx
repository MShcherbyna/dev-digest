import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { FindingRecord } from "@devdigest/shared";
import type { Severity } from "@devdigest/ui";
import { SeverityFindingsBreakdown } from "./SeverityFindingsBreakdown";
import { countBySeverity } from "./helpers";

afterEach(cleanup);

const FINDINGS: FindingRecord[] = [
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
];

const COUNTS: Record<Severity, number> = countBySeverity(FINDINGS);

describe("SeverityFindingsBreakdown", () => {
  it("renders nothing when no severity has a count", () => {
    const { container } = render(
      <SeverityFindingsBreakdown counts={{ CRITICAL: 0, WARNING: 0, SUGGESTION: 0, INFO: 0 }} findings={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the severity breakdown and opens a read-only popover titled 'N FINDINGS IN THIS RUN' on hover", () => {
    render(<SeverityFindingsBreakdown counts={COUNTS} findings={FINDINGS} />);
    expect(screen.getByText("1 CRITICAL")).toBeInTheDocument();
    expect(screen.getByText("1 WARNING")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByText("1 CRITICAL").closest("div")!);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("2 FINDINGS IN THIS RUN")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("A live key is committed.")).toBeInTheDocument();
    // read-only: no buttons/links inside the popover
    expect(dialog.querySelectorAll("button, a").length).toBe(0);

    fireEvent.mouseLeave(screen.getByText("1 CRITICAL").closest("div")!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows 'Loading…' when findings is undefined (still fetching)", () => {
    render(<SeverityFindingsBreakdown counts={COUNTS} findings={undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Findings by severity" }));
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders every finding (no '+N more' truncation) and scrolls the list instead of growing the popover", () => {
    const many: FindingRecord[] = Array.from({ length: 8 }, (_, i) => ({
      ...FINDINGS[0]!,
      id: `f${i}`,
      title: `Finding ${i}`,
    }));
    render(<SeverityFindingsBreakdown counts={countBySeverity(many)} findings={many} />);
    fireEvent.mouseEnter(screen.getByText("8 CRITICAL").closest("div")!);

    for (const f of many) {
      expect(screen.getByText(f.title)).toBeInTheDocument();
    }
    expect(screen.queryByText(/more$/)).not.toBeInTheDocument();

    // second child of the dialog is the scrollable findings list (first is the header)
    const list = screen.getByRole("dialog").children[1] as HTMLElement;
    expect(list.style.overflowY).toBe("auto");
  });

  it("clicking the trigger pins the popover open even after the mouse leaves, and calls onOpenChange", () => {
    const onOpenChange = vi.fn();
    render(<SeverityFindingsBreakdown counts={COUNTS} findings={FINDINGS} onOpenChange={onOpenChange} />);
    const trigger = screen.getByRole("button", { name: "Findings by severity" });
    fireEvent.click(trigger);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    fireEvent.mouseLeave(trigger.parentElement!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
