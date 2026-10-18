/* TabsView — S5 Tabs + detail view (AC-22, AC-29, AC-33). */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, within, cleanup } from "@testing-library/react";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import type { EvalAwareFinding } from "@/lib/hooks/eval";
import type { AgentColumnView } from "@/lib/types";
import { TabsView } from "./TabsView";

const findingActionMutate = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: findingActionMutate, isPending: false }),
}));
vi.mock("@/lib/hooks/translation", () => ({
  useTranslateFinding: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));
vi.mock("@/lib/hooks/eval", () => ({
  useCreateCaseFromFinding: () => ({ mutate: vi.fn(), isPending: false }),
  useEvalCaseDraftFromFinding: () => ({ data: undefined, isLoading: false, isError: false, error: undefined }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgent: () => ({ data: undefined, isLoading: false }),
}));

afterEach(cleanup);

function column(o: Partial<AgentColumnView>): AgentColumnView {
  return {
    run_id: "run-1",
    agent_id: "agent-1",
    agent_name: "Security",
    provider: "anthropic",
    model: "claude",
    status: "done",
    verdict: "request_changes",
    score: 80,
    summary: "Found one issue.",
    duration_ms: 4000,
    cost_usd: 0.03,
    findings: [],
    ...o,
  };
}

function fullFinding(o: Partial<EvalAwareFinding>): EvalAwareFinding {
  return {
    id: "f1",
    severity: "WARNING",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed in source.",
    suggestion: null,
    confidence: 0.82,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function thinFinding(o: Partial<AgentColumnView["findings"][number]>) {
  return {
    id: "f1",
    severity: "WARNING" as const,
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    confidence: 0.82,
    rationale: "A secret is committed in source.",
    suggested_fix: null,
    group_id: null,
    ...o,
  };
}

const noop = () => {};

describe("TabsView", () => {
  it("AC-29: one tab per agent; the active tab's summary card and finding render score, 'View trace', confidence % and category — and a SUGGESTED FIX block only when suggested_fix is present", async () => {
    const columns = [
      column({ run_id: "r1", agent_id: "a1", agent_name: "Security", score: 80 }),
      column({ run_id: "r2", agent_id: "a2", agent_name: "Performance", score: 65 }),
    ];
    const findingsById = new Map<string, EvalAwareFinding>([["f1", fullFinding({ suggestion: null })]]);
    columns[0]!.findings = [thinFinding({})];
    const onOpenTrace = vi.fn();

    renderWithIntl(
      <TabsView columns={columns} prId="pr1" findingsById={findingsById} onOpenTrace={onOpenTrace} />,
    );

    expect(screen.getByRole("button", { name: "Security 80" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Performance 65" })).toBeInTheDocument();
    expect(screen.getByText("Found one issue.")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("82% conf")).toBeInTheDocument();

    await userEvent.click(screen.getAllByText("View trace")[0]!);
    expect(onOpenTrace).toHaveBeenCalledWith("r1", "Security");

    // The first (and only) finding is expanded by default, so its detail —
    // including the absent/present SUGGESTED FIX block — is visible without
    // an extra click.
    expect(screen.queryByText("Suggested fix")).not.toBeInTheDocument();
    cleanup();

    findingsById.set("f1", fullFinding({ suggestion: "Move it to an env var." }));
    renderWithIntl(<TabsView columns={columns} prId="pr1" findingsById={findingsById} onOpenTrace={noop} />);
    expect(screen.getByText("Suggested fix")).toBeInTheDocument();
  });

  it("AC-33: each finding's action row shows exactly Accept/Dismiss/Turn into eval case — Learn and Reply to author are absent from the DOM", async () => {
    const columns = [column({ run_id: "r1", agent_id: "a1", agent_name: "Security", findings: [thinFinding({})] })];
    const findingsById = new Map<string, EvalAwareFinding>([["f1", fullFinding({})]]);
    renderWithIntl(<TabsView columns={columns} prId="pr1" findingsById={findingsById} onOpenTrace={noop} />);

    // The action row is only shown once the card is expanded — the first
    // (and only) finding here is expanded by default.
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeInTheDocument();
    expect(screen.queryByText("Learn")).not.toBeInTheDocument();
    expect(screen.queryByText("Reply to author")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Translate" })).not.toBeInTheDocument();
  });

  it("AC-22: a grouped finding renders the Similar findings section with its 2 other-group members", () => {
    const columns = [
      column({ run_id: "r1", agent_id: "a1", agent_name: "Security", findings: [thinFinding({ group_id: "g1" })] }),
      column({
        run_id: "r2",
        agent_id: "a2",
        agent_name: "Performance",
        findings: [thinFinding({ id: "f2", title: "Perf take", group_id: "g1" })],
      }),
      column({
        run_id: "r3",
        agent_id: "a3",
        agent_name: "Mentor",
        findings: [thinFinding({ id: "f3", title: "Mentor take", group_id: "g1" })],
      }),
    ];
    const findingsById = new Map<string, EvalAwareFinding>([["f1", fullFinding({})]]);
    renderWithIntl(<TabsView columns={columns} prId="pr1" findingsById={findingsById} onOpenTrace={noop} />);

    // Agent names also appear as tabs now (AgentTabBar), so scope these
    // assertions to the "Similar findings" section specifically.
    const similar = screen.getByText("Similar findings").parentElement!;
    expect(within(similar).getByText("Performance")).toBeInTheDocument();
    expect(within(similar).getByText("Perf take")).toBeInTheDocument();
    expect(within(similar).getByText("Mentor")).toBeInTheDocument();
    expect(within(similar).getByText("Mentor take")).toBeInTheDocument();
  });
});
