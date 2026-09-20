import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { SUMMARY, SUMMARY_2 } from "@/test/fixtures";

const updateMutate = vi.fn();
const deleteMutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false }),
}));

import { SkillCard } from "./SkillCard";

beforeEach(() => {
  updateMutate.mockReset();
  deleteMutate.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SkillCard", () => {
  it("shows name, description, type/source badges and agents count; card click opens it", async () => {
    const onClick = vi.fn();
    renderWithIntl(<SkillCard skill={SUMMARY} onClick={onClick} />);
    expect(screen.getByText("uncovered-branches")).toBeInTheDocument();
    expect(screen.getByText("Flag new branches no test exercises")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.getByText(`v${SUMMARY.version}`)).toBeInTheDocument();
    expect(screen.getByText("2 agents")).toBeInTheDocument();
    await userEvent.click(screen.getByText("uncovered-branches"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("toggle and delete act without opening the card", async () => {
    const onClick = vi.fn();
    renderWithIntl(<SkillCard skill={SUMMARY} onClick={onClick} />);

    await userEvent.click(screen.getByRole("switch"));
    expect(updateMutate).toHaveBeenCalledWith({ id: "sk1", patch: { enabled: false } });

    await userEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    const dialog = screen.getByRole("dialog");
    expect(deleteMutate).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteMutate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(deleteMutate).toHaveBeenCalledWith("sk1", expect.anything());
    expect(onClick).not.toHaveBeenCalled();
  });

  it("labels imported skills", () => {
    renderWithIntl(<SkillCard skill={SUMMARY_2} />);
    expect(screen.getByText("Imported")).toBeInTheDocument();
    expect(screen.getByText("0 agents")).toBeInTheDocument();
  });
});
