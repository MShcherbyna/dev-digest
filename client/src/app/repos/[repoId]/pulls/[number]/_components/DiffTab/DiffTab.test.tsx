import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiffResponse } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render-intl";

const mutate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePrSmartDiff: () => ({ data: SMART_DIFF }),
  usePrReviews: () => ({ data: REVIEWS }),
  useFindingAction: () => ({ mutate, isPending: false }),
}));
vi.mock("@/lib/hooks/eval", () => ({
  useCreateCaseFromFinding: () => ({ mutate: vi.fn(), isPending: false }),
  useEvalCaseDraftFromFinding: () => ({ data: undefined, isLoading: false, isError: false, error: undefined }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgent: () => ({ data: undefined, isLoading: false }),
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
  scroll.mockReset();
});

// Docs-group file with a real patch so a target line exists inside a collapsed-by-default group.
const README_PATCH = "@@ -1,2 +1,3 @@\n intro\n+second\n outro";
const TARGET_FILES: PrFile[] = [
  FILES[0]!,
  { path: "README.md", additions: 1, deletions: 0, patch: README_PATCH },
];

const scroll = vi.fn();
beforeEach(() => {
  Element.prototype.scrollIntoView = scroll;
});

function headerOf(path: string): HTMLElement {
  return screen.getByText(path).parentElement!.parentElement!;
}

describe("DiffTab deep-link target (PR Brief)", () => {
  // Catches: AC-16/AC-26 - a brief link into a file inside the collapsed Docs group must open
  // the group and the file, outline it, scroll the target row and focus the header, in Smart order.
  it("opens the collapsed group of the target file, outlines it, scrolls to the line and focuses the header", () => {
    renderWithIntl(
      <DiffTab
        prId="pr1"
        filesCount={2}
        files={TARGET_FILES}
        repoFullName="acme/repo"
        headSha="sha1"
        target={{ path: "README.md", line: 2 }}
      />,
    );

    expect(screen.getByRole("button", { name: /Docs/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("second")).toBeInTheDocument();
    const head = headerOf("README.md");
    expect(head).toHaveFocus();
    expect(head.parentElement!.getAttribute("style")).toContain("var(--accent)");
    const scrolled = scroll.mock.contexts[0] as HTMLElement;
    expect(scrolled.getAttribute("data-new-line")).toBe("2");
    expect(scroll).toHaveBeenCalledWith({ block: "center" });
    // still Smart order (AC-26 "current order") and other files are untouched
    expect(screen.getByRole("button", { name: "Smart order" })).toBeInTheDocument();
    expect(screen.queryByText("File not in this PR's diff")).not.toBeInTheDocument();
  });

  // Catches: the target being dropped when the user is (or switches to) Original order.
  it("also targets the file in Original order", () => {
    renderWithIntl(
      <DiffTab
        prId="pr1"
        filesCount={2}
        files={TARGET_FILES}
        repoFullName="acme/repo"
        headSha="sha1"
        target={{ path: "src/core.ts", line: null }}
      />,
    );
    scroll.mockReset();
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    expect(headerOf("src/core.ts")).toHaveFocus();
    expect((scroll.mock.contexts[0] as HTMLElement)).toBe(headerOf("src/core.ts"));
  });

  // Catches: AC-39 (direct URL to a file that is not in this diff) - exactly one toast, normal
  // view, nothing focused / scrolled / expanded; a re-render with the same target must not repeat it.
  it("an unresolved target raises the toast once and renders the normal view", () => {
    // The toast bridge (`notify`) is registered by ToastProvider's effect, which runs AFTER
    // children's effects on the same commit - in the app DiffTab mounts later (after data loads),
    // so mount it one commit late here as well. The target object is rebuilt on every render,
    // exactly like page.tsx does.
    function Harness() {
      const [late, setLate] = React.useState(false);
      const [, setN] = React.useState(0);
      React.useEffect(() => setLate(true), []);
      return (
        <>
          <button onClick={() => setN((n) => n + 1)}>bump</button>
          {late && (
            <DiffTab
              prId="pr1"
              filesCount={2}
              files={TARGET_FILES}
              repoFullName="acme/repo"
              headSha="sha1"
              target={{ path: "package.json", line: 34 }}
            />
          )}
        </>
      );
    }
    renderWithIntl(<Harness />);

    expect(screen.getAllByText("File not in this PR's diff")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Docs/ })).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector("[tabindex='-1']")).toBeNull();
    expect(scroll).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "bump" }));
    expect(screen.getAllByText("File not in this PR's diff")).toHaveLength(1);
  });
});

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
    const paths = screen.getAllByText(/\.(ts|md)$/).map((n) => n.textContent);
    expect(paths).toEqual(FILES.map((f) => f.path));

    // Switch back to Smart order: group headers reappear.
    fireEvent.click(screen.getByRole("button", { name: "Smart order" }));
    expect(screen.getByRole("button", { name: /Core logic/ })).toBeInTheDocument();

    // Accept the inline finding.
    fireEvent.click(screen.getByText("Accept"));
    expect(mutate).toHaveBeenCalledWith({ findingId: "f1", action: "accept", prId: "pr1" });
  });

  it("renders the 'Turn into eval case' action on the inline finding card (disabled while undecided)", () => {
    // Catches: DiffTab not passing prId to the injected FindingCard, so the action is missing in the diff view.
    renderWithIntl(<DiffTab prId="pr1" filesCount={FILES.length} files={FILES} repoFullName="acme/repo" headSha="sha1" />);
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeDisabled();
  });
});
