import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { SUMMARY, SUMMARY_2 } from "@/test/fixtures";
import { SkillListItem } from "./SkillListItem";

afterEach(cleanup);

describe("SkillListItem", () => {
  it("shows name, description, type/source badges and the usage footer", () => {
    renderWithIntl(<SkillListItem skill={SUMMARY} />);
    expect(screen.getByText("uncovered-branches")).toBeInTheDocument();
    expect(screen.getByText("Flag new branches no test exercises")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.getByText("2 agents")).toBeInTheDocument();
    expect(screen.getByText("80% pull")).toBeInTheDocument();
    expect(screen.getByText("55% accept")).toBeInTheDocument();
  });

  it("renders an em dash when pull/accept are null and labels imported skills", () => {
    renderWithIntl(<SkillListItem skill={SUMMARY_2} />);
    expect(screen.getByText("Imported")).toBeInTheDocument();
    expect(screen.getByText("— pull")).toBeInTheDocument();
    expect(screen.getByText("— accept")).toBeInTheDocument();
    expect(screen.getByText("0 agents")).toBeInTheDocument();
  });

  it("toggling enabled does not select the item", async () => {
    const onClick = vi.fn();
    const onToggle = vi.fn();
    renderWithIntl(<SkillListItem skill={SUMMARY} onClick={onClick} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(onClick).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText("uncovered-branches"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
