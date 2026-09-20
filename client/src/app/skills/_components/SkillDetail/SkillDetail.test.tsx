import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { SKILL } from "@/test/fixtures";

const replace = vi.fn();
let tabParam: string | null = null;
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(tabParam ? `tab=${tabParam}` : ""),
}));

const useSkill = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useSkill: (id: string | null) => useSkill(id),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SkillDetail } from "./SkillDetail";

beforeEach(() => {
  replace.mockReset();
  useSkill.mockReset();
  tabParam = null;
});
afterEach(cleanup);

describe("SkillDetail", () => {
  it("shows the header, a disabled Run on evals button and the five tabs", () => {
    useSkill.mockReturnValue({ data: SKILL, isLoading: false, isError: false });
    renderWithIntl(<SkillDetail id="sk1" />);
    expect(screen.getByRole("heading", { name: "uncovered-branches" })).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run on evals" })).toBeDisabled();
    for (const name of ["Config", "Preview", "Evals", "Stats", "Versions"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Skill body")).toBeInTheDocument(); // Config tab by default
  });

  it("writes the tab into ?tab=", async () => {
    useSkill.mockReturnValue({ data: SKILL, isLoading: false, isError: false });
    renderWithIntl(<SkillDetail id="sk1" />);
    await userEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(replace).toHaveBeenCalledWith("/skills/sk1?tab=preview");
  });

  it("renders the tab from ?tab= and falls back to Config for unknown values", () => {
    useSkill.mockReturnValue({ data: SKILL, isLoading: false, isError: false });
    tabParam = "preview";
    renderWithIntl(<SkillDetail id="sk1" />);
    expect(screen.getByTestId("prompt-block")).toBeInTheDocument();
    cleanup();
    tabParam = "bogus";
    renderWithIntl(<SkillDetail id="sk1" />);
    expect(screen.getByLabelText("Skill body")).toBeInTheDocument();
  });

  it("/skills/new renders the empty create form with only the Config tab and does not fetch", () => {
    useSkill.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    renderWithIntl(<SkillDetail id="new" />);
    expect(useSkill).toHaveBeenCalledWith(null);
    expect(screen.getByRole("heading", { name: "New skill" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Config" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
  });

  it("shows a not-found state", () => {
    useSkill.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error("x") });
    renderWithIntl(<SkillDetail id="missing" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load this skill.");
  });
});
