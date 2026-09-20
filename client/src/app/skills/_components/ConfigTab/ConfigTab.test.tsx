import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { SKILL } from "@/test/fixtures";

const createMutate = vi.fn();
const updateMutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutate: createMutate, isPending: false }),
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
}));

import { ConfigTab } from "./ConfigTab";

beforeEach(() => {
  createMutate.mockReset();
  updateMutate.mockReset();
});
afterEach(cleanup);

describe("skill ConfigTab", () => {
  it("shows directive-wording helper text and the empty create form", () => {
    renderWithIntl(<ConfigTab skill={null} />);
    expect(screen.getByText(/Write it as a directive/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
    expect(screen.getByLabelText("Skill body")).toHaveValue("");
    expect(screen.getByText("~0 tokens")).toBeInTheDocument();
  });

  it("creates a manual skill once name and body are filled", async () => {
    const onCreated = vi.fn();
    createMutate.mockImplementation((_input, opts) => opts?.onSuccess?.({ id: "new1" }));
    renderWithIntl(<ConfigTab skill={null} onCreated={onCreated} />);
    await userEvent.type(screen.getByPlaceholderText("uncovered-branches"), "my-skill");
    await userEvent.type(screen.getByLabelText("Skill body"), "abcd");
    expect(screen.getByText("~1 tokens")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "my-skill", body: "abcd", type: "rubric", source: "manual", enabled: true }),
      expect.anything(),
    );
    expect(onCreated).toHaveBeenCalledWith("new1");
  });

  it("existing skill: Save is disabled until edited, edits show unsaved, Cancel reverts", async () => {
    renderWithIntl(<ConfigTab skill={SKILL} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    const body = screen.getByLabelText("Skill body");
    await userEvent.type(body, "!");
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(body).toHaveValue(SKILL.body);
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
  });

  it("saves changes through the update hook", async () => {
    renderWithIntl(<ConfigTab skill={SKILL} />);
    await userEvent.click(screen.getByRole("switch"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(updateMutate).toHaveBeenCalledWith(
      { id: "sk1", patch: expect.objectContaining({ enabled: false, name: SKILL.name }) },
      expect.anything(),
    );
  });

  it("Cancel on the create form calls onCancelNew", async () => {
    const onCancelNew = vi.fn();
    renderWithIntl(<ConfigTab skill={null} onCancelNew={onCancelNew} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancelNew).toHaveBeenCalled();
  });
});
