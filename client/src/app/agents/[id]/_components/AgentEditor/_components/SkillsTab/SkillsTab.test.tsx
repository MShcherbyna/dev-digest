import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@/test/user";
import type { Agent } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render-intl";
import { SUMMARY, SUMMARY_2 } from "@/test/fixtures";

const SUMMARY_3 = { ...SUMMARY, id: "sk3", name: "edge-case-checklist", type: "convention" as const };

const saveMutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: [SUMMARY, SUMMARY_2, SUMMARY_3], isError: false, refetch: vi.fn() }),
  useAgentSkills: () => ({
    data: [
      { agent_id: "ag1", skill_id: "sk2", order: 0, enabled: true },
      { agent_id: "ag1", skill_id: "sk1", order: 1, enabled: false },
    ],
    isError: false,
    refetch: vi.fn(),
  }),
  useSetAgentSkills: () => ({ mutateAsync: saveMutate, isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";
import { buildRows, moveRow, toLinks } from "./helpers";

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;

beforeEach(() => saveMutate.mockReset().mockResolvedValue([]));
afterEach(cleanup);

const names = () => screen.getAllByRole("listitem").map((li) => li.textContent ?? "");

describe("agent SkillsTab", () => {
  it("shows N of M enabled, rows in link order then unlinked, type badges and a global-off tooltip", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    expect(screen.getByText("1 of 3 enabled")).toBeInTheDocument();
    expect(screen.getByText("Order matters", { exact: false })).toHaveTextContent("Drag to reorder.");
    const rows = names();
    expect(rows[0]).toContain("flaky-test-detector");
    expect(rows[1]).toContain("uncovered-branches");
    expect(rows[2]).toContain("edge-case-checklist");
    expect(screen.getByText("convention")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")[0]).toHaveAttribute("title", expect.stringMatching(/disabled globally/i)); // sk2
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
  });

  it("filters rows by name", async () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    await userEvent.type(screen.getByPlaceholderText("Filter skills…"), "edge");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("a checkbox toggle persists immediately, in order, and updates the count optimistically", async () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Enable edge-case-checklist for this agent" }));
    expect(saveMutate).toHaveBeenCalledWith([
      { skill_id: "sk2", order: 0, enabled: true },
      { skill_id: "sk1", order: 1, enabled: false },
      { skill_id: "sk3", order: 2, enabled: true },
    ]);
    expect(screen.getByText("2 of 3 enabled")).toBeInTheDocument();
  });

  it("rolls back the optimistic change when the save fails", async () => {
    saveMutate.mockRejectedValueOnce(new Error("boom"));
    renderWithIntl(<SkillsTab agent={AGENT} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Enable edge-case-checklist for this agent" }));
    await waitFor(() => expect(screen.getByText("1 of 3 enabled")).toBeInTheDocument());
  });

  it("dropping a row reorders it and persists the new order", async () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const items = screen.getAllByRole("listitem");
    const dataTransfer = { setData: vi.fn(), effectAllowed: "" };
    fireEvent.dragStart(items[2]!, { dataTransfer });
    fireEvent.dragOver(items[0]!, { dataTransfer });
    fireEvent.drop(items[0]!, { dataTransfer });
    expect(names()[0]).toContain("edge-case-checklist");
    expect(saveMutate).toHaveBeenCalledWith([
      // sk3 is unlinked + unchecked, so it stays out of the payload
      { skill_id: "sk2", order: 0, enabled: true },
      { skill_id: "sk1", order: 1, enabled: false },
    ]);
  });
});

describe("helpers", () => {
  const rows = buildRows(
    [SUMMARY, SUMMARY_2, SUMMARY_3],
    [{ agent_id: "a", skill_id: "sk1", order: 0, enabled: false }],
  );

  it("buildRows puts linked first; unlinked start unchecked", () => {
    expect(rows).toEqual([
      { id: "sk1", linked: true, checked: false },
      { id: "sk2", linked: false, checked: false },
      { id: "sk3", linked: false, checked: false },
    ]);
  });

  it("moveRow moves onto the target slot and ignores unknown ids", () => {
    expect(moveRow(rows, "sk3", "sk1").map((r) => r.id)).toEqual(["sk3", "sk1", "sk2"]);
    expect(moveRow(rows, "nope", "sk1")).toBe(rows);
  });

  it("toLinks keeps linked-but-unchecked rows disabled and drops untouched ones", () => {
    expect(toLinks(rows)).toEqual([{ skill_id: "sk1", order: 0, enabled: false }]);
  });
});
