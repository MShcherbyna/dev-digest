import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { SUMMARY, SUMMARY_2 } from "@/test/fixtures";
import { SkillsList } from "./SkillsList";
import { filterSkills } from "./helpers";

afterEach(cleanup);

const noop = () => {};
const base = { onSelect: noop, onToggle: noop, onCreate: noop, onImport: noop };

describe("SkillsList", () => {
  it("lists skills, filters by search and selects on click", async () => {
    const onSelect = vi.fn();
    renderWithIntl(<SkillsList {...base} onSelect={onSelect} skills={[SUMMARY, SUMMARY_2]} activeId="sk1" />);
    expect(screen.getByText("uncovered-branches")).toBeInTheDocument();
    expect(screen.getByText("flaky-test-detector")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Search skills…"), "flaky");
    expect(screen.queryByText("uncovered-branches")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("flaky-test-detector"));
    expect(onSelect).toHaveBeenCalledWith("sk2");
  });

  it("shows the empty state with a create CTA", async () => {
    const onCreate = vi.fn();
    renderWithIntl(<SkillsList {...base} onCreate={onCreate} skills={[]} />);
    expect(screen.getByText("No skills yet")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create new" }));
    expect(onCreate).toHaveBeenCalled();
  });

  it("shows an error state with retry", async () => {
    const onRetry = vi.fn();
    renderWithIntl(<SkillsList {...base} skills={[]} isError onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load skills.");
  });

  it("forwards the global toggle with the skill id", async () => {
    const onToggle = vi.fn();
    renderWithIntl(<SkillsList {...base} onToggle={onToggle} skills={[SUMMARY]} />);
    await userEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith("sk1", false);
  });
});

describe("filterSkills", () => {
  it("matches name or description case-insensitively; blank keeps all", () => {
    expect(filterSkills([SUMMARY, SUMMARY_2], "  ")).toHaveLength(2);
    expect(filterSkills([SUMMARY, SUMMARY_2], "TIME-DEPENDENT")).toEqual([SUMMARY_2]);
  });
});
