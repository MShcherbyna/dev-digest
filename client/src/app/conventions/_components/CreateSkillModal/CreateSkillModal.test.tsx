import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import type { Convention } from "@/lib/hooks/conventions";

const mutate = vi.fn();
const onCreated = vi.fn();
vi.mock("@/lib/hooks/conventions", () => ({
  useCreateSkillFromConventions: () => ({ mutate, isPending: false }),
}));

import { CreateSkillModal } from "./CreateSkillModal";

beforeEach(() => {
  mutate.mockReset();
  onCreated.mockReset();
});
afterEach(cleanup);

const CONVENTIONS: Convention[] = ["a", "b", "c"].map((id) => ({
  id,
  rule: `Rule ${id}`,
  evidence_path: `src/${id}.ts`,
  evidence_snippet: "code",
  evidence_line: 4,
  confidence: 0.9,
  accepted: true,
}));

const render = (onClose = vi.fn()) =>
  renderWithIntl(
    <CreateSkillModal
      repoId="r1"
      repoFullName="acme/ai-customer-support"
      conventions={CONVENTIONS}
      onClose={onClose}
      onCreated={onCreated}
    />,
  );

describe("CreateSkillModal", () => {
  it("prefills name and description from the repo and shows the merge banner", () => {
    render();
    expect(screen.getByDisplayValue("ai-customer-support-conventions")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("3 house conventions extracted from ai-customer-support"),
    ).toBeInTheDocument();
    expect(screen.getByText(/3 accepted conventions/)).toBeInTheDocument();
    expect(screen.getByText("← Saved as v1 · added to Skills Lab")).toBeInTheDocument();
  });

  it("shows an editable body prefilled from the accepted conventions", () => {
    render();
    const body = screen.getByDisplayValue(/# Repo conventions/) as HTMLTextAreaElement;
    expect(body.value).toContain("- Rule a\n  - evidence: `src/a.ts#L4`");
    expect(body.value).toContain("- Rule c");
  });

  it("Create skill sends name, description, the edited body and the accepted ids", async () => {
    render();
    const body = screen.getByDisplayValue(/# Repo conventions/);
    await userEvent.clear(body);
    await userEvent.type(body, "# My skill");
    await userEvent.click(screen.getByRole("button", { name: /Create skill/ }));
    expect(mutate).toHaveBeenCalledWith(
      {
        name: "ai-customer-support-conventions",
        description: "3 house conventions extracted from ai-customer-support",
        body: "# My skill",
        convention_ids: ["a", "b", "c"],
      },
      expect.any(Object),
    );
  });

  it("opens the new skill after it is created", async () => {
    render();
    await userEvent.click(screen.getByRole("button", { name: /Create skill/ }));
    const [, opts] = mutate.mock.calls[0]!;
    opts.onSuccess({ id: "skill-42" });
    expect(onCreated).toHaveBeenCalledWith("skill-42");
  });

  it("Create is disabled with an empty name; Cancel closes", async () => {
    const onClose = vi.fn();
    render(onClose);
    await userEvent.clear(screen.getByLabelText("Name"));
    expect(screen.getByRole("button", { name: /Create skill/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });
});
