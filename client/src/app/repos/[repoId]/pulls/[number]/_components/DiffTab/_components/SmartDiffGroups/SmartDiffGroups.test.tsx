import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile } from "@devdigest/shared";
import type { DiffFindingsApi } from "@/components/diff-viewer";
import prReview from "../../../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../../../messages/en/shell.json";
import type { ViewGroup } from "../../helpers";
import { SmartDiffGroups } from "./SmartDiffGroups";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function file(path: string, patch = ""): PrFile {
  return { path, additions: 5, deletions: 1, patch };
}

function finding(overrides: Partial<FindingRecord>): FindingRecord {
  return {
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
    ...overrides,
  };
}

const CORE_PATCH = "@@ -1,3 +1,3 @@\n line1\n+line2\n line3";

const GROUPS: ViewGroup[] = [
  { role: "core", files: [file("src/core.ts", CORE_PATCH)], findingFiles: 1 },
  { role: "tests", files: [file("src/core.test.ts")], findingFiles: 0 },
  { role: "wiring", files: [file("src/index.ts")], findingFiles: 0 },
  { role: "docs", files: [file("README.md")], findingFiles: 0 },
  { role: "boilerplate", files: [file("pnpm-lock.yaml")], findingFiles: 0 },
];

describe("SmartDiffGroups", () => {
  it("shows all 5 group headers in order with labels and file counts; docs/boilerplate start collapsed", () => {
    renderWithIntl(<SmartDiffGroups groups={GROUPS} />);

    const headers = screen.getAllByRole("button");
    expect(headers.map((h) => h.textContent)).toEqual([
      expect.stringContaining("Core logic"),
      expect.stringContaining("Tests"),
      expect.stringContaining("Wiring"),
      expect.stringContaining("Docs"),
      expect.stringContaining("Boilerplate"),
    ]);
    expect(screen.getAllByText("1 files")).toHaveLength(5);

    // core/tests/wiring start expanded — their file paths are visible.
    expect(screen.getByText("src/core.ts")).toBeInTheDocument();
    expect(screen.getByText("src/core.test.ts")).toBeInTheDocument();
    expect(screen.getByText("src/index.ts")).toBeInTheDocument();
    // docs/boilerplate start collapsed — their file paths are not visible yet.
    expect(screen.queryByText("README.md")).not.toBeInTheDocument();
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();
  });

  it("the finding-files dot shows the file count (not the finding count), and a file with findings shows the 'Has findings' dot plus the inline card under its line", () => {
    const findings: DiffFindingsApi = {
      linesByPath: new Map([["src/core.ts", [2]]]),
      byPath: new Map([["src/core.ts", [finding({})]]]),
      renderFinding: (f) => <div data-testid={`finding-${f.id}`}>{f.title}</div>,
    };
    renderWithIntl(<SmartDiffGroups groups={GROUPS} findings={findings} />);

    const coreHeader = screen.getAllByRole("button")[0]!;
    expect(within(coreHeader).getByText("● 1")).toBeInTheDocument();

    // the file card shows the "Has findings" dot
    expect(screen.getByLabelText("Has findings")).toBeInTheDocument();

    // this file's patch is short, so it starts expanded — the inline finding
    // card (injected via renderFinding) renders under line 2.
    expect(screen.getByTestId("finding-f1")).toBeInTheDocument();
  });
});
