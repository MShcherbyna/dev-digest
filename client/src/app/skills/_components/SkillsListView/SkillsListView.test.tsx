import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { SUMMARY, SUMMARY_2 } from "@/test/fixtures";
import { filterSkills } from "./helpers";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../ImportSkillModal", () => ({
  ImportSkillModal: ({ onImported }: { onImported: (id: string) => void }) => (
    <button onClick={() => onImported("new-id")}>finish import</button>
  ),
}));

const useSkills = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => useSkills(),
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SkillsListView } from "./SkillsListView";

beforeEach(() => push.mockReset());
afterEach(cleanup);

describe("SkillsListView", () => {
  it("lists skills as cards, filters by search, opens a skill and routes create/import", async () => {
    useSkills.mockReturnValue({ data: [SUMMARY, SUMMARY_2], isLoading: false, isError: false });
    renderWithIntl(<SkillsListView />);
    expect(screen.getByRole("heading", { name: "Skills" })).toBeInTheDocument();
    expect(screen.getByText("uncovered-branches")).toBeInTheDocument();
    expect(screen.getByText("flaky-test-detector")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Search skills…"), "flaky");
    expect(screen.queryByText("uncovered-branches")).not.toBeInTheDocument();
    await userEvent.clear(screen.getByPlaceholderText("Search skills…"));

    await userEvent.click(screen.getByText("uncovered-branches"));
    expect(push).toHaveBeenLastCalledWith("/skills/sk1?tab=config");

    await userEvent.click(screen.getByRole("button", { name: /add skill/i }));
    await userEvent.click(screen.getByRole("button", { name: /create new/i }));
    expect(push).toHaveBeenLastCalledWith("/skills/new");

    await userEvent.click(screen.getByRole("button", { name: /add skill/i }));
    await userEvent.click(screen.getByRole("button", { name: /import \.md/i }));
    await userEvent.click(screen.getByRole("button", { name: "finish import" }));
    expect(push).toHaveBeenLastCalledWith("/skills/new-id?tab=config");
  });

  it("shows the empty state and the error state", () => {
    useSkills.mockReturnValue({ data: [], isLoading: false, isError: false });
    renderWithIntl(<SkillsListView />);
    expect(screen.getByText("No skills yet")).toBeInTheDocument();
    cleanup();

    useSkills.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });
    renderWithIntl(<SkillsListView />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load skills.");
  });
});

describe("filterSkills", () => {
  it("matches name or description, case-insensitively", () => {
    expect(filterSkills([SUMMARY, SUMMARY_2], "TIME-DEPENDENT")).toEqual([SUMMARY_2]);
    expect(filterSkills([SUMMARY, SUMMARY_2], "  ")).toHaveLength(2);
  });
});
