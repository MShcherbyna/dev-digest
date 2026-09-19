import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { screen, cleanup, fireEvent, within } from "@testing-library/react";
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
  useSetAgentSkills: () => ({ mutate: saveMutate, isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";
import { buildRows, moveRow, toLinks } from "./helpers";

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;

beforeEach(() => saveMutate.mockReset());
afterEach(cleanup);

const names = () => screen.getAllByRole("listitem").map((li) => li.textContent ?? "");

describe("agent SkillsTab", () => {
  it("shows N of M enabled, rows in link order then unlinked, and type badges", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    expect(screen.getByText("1 of 3 enabled")).toBeInTheDocument();
    const rows = names();
    expect(rows[0]).toContain("flaky-test-detector");
    expect(rows[1]).toContain("uncovered-branches");
    expect(rows[2]).toContain("edge-case-checklist");
    expect(screen.getByText("convention")).toBeInTheDocument();
    expect(screen.getByText("off globally")).toBeInTheDocument(); // sk2 is globally disabled
  });

  it("filters rows by name", async () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    await userEvent.type(screen.getByPlaceholderText("Filter skills…"), "edge");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("checkbox toggles the per-agent enabled flag and Save posts links in order", async () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    expect(screen.getByRole("button", { name: "Save skills" })).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: "Enable edge-case-checklist for this agent" }));
    expect(screen.getByText("2 of 3 enabled")).toBeInTheDocument();
    expect(screen.getByText("unsaved changes")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save skills" }));
    expect(saveMutate).toHaveBeenCalledWith(
      [
        { skill_id: "sk2", order: 0, enabled: true },
        { skill_id: "sk1", order: 1, enabled: false },
        { skill_id: "sk3", order: 2, enabled: true },
      ],
      expect.anything(),
    );
  });

  it("drag and drop reorders rows", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const items = screen.getAllByRole("listitem");
    const dataTransfer = { setData: vi.fn(), effectAllowed: "" };
    fireEvent.dragStart(items[2]!, { dataTransfer });
    fireEvent.dragOver(items[0]!, { dataTransfer });
    fireEvent.drop(items[0]!, { dataTransfer });
    const rows = names();
    expect(rows[0]).toContain("edge-case-checklist");
    expect(within(screen.getAllByRole("listitem")[0]!).getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByText("unsaved changes")).toBeInTheDocument();
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
