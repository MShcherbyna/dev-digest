import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";

const useSkillVersions = vi.fn();
const restoreMutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useSkillVersions: (id: string) => useSkillVersions(id),
  useRestoreSkillVersion: () => ({ mutate: restoreMutate, isPending: false }),
}));

import { VersionsTab } from "./VersionsTab";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  restoreMutate.mockReset();
});

const THREE = [
  { skill_id: "sk1", version: 3, body: "third body", created_at: "2026-09-03T10:00:00Z" },
  { skill_id: "sk1", version: 2, body: "second body", created_at: "2026-09-02T10:00:00Z" },
  { skill_id: "sk1", version: 1, body: "first body", created_at: "2026-09-01T10:00:00Z" },
];

describe("VersionsTab", () => {
  it("lists versions and marks the current one", () => {
    useSkillVersions.mockReturnValue({
      data: [
        { skill_id: "sk1", version: 2, body: "new body", created_at: "2026-09-02T10:00:00Z" },
        { skill_id: "sk1", version: 1, body: "old body", created_at: "2026-09-01T10:00:00Z" },
      ],
      isLoading: false,
      isError: false,
    });
    renderWithIntl(<VersionsTab skillId="sk1" currentVersion={2} />);
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("new body")).toBeInTheDocument();
    expect(screen.queryByText("old body")).not.toBeInTheDocument();
    expect(screen.getAllByText("Current")).toHaveLength(1);
  });

  it("Diff expands a collapsed version and Hide collapses it again", async () => {
    useSkillVersions.mockReturnValue({ data: THREE, isLoading: false, isError: false });
    renderWithIntl(<VersionsTab skillId="sk1" currentVersion={3} />);
    expect(screen.getByText("third body")).toBeInTheDocument();
    expect(screen.queryByText("second body")).not.toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "Diff" })[0]!);
    expect(screen.getByText("second body")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Hide" })[1]!);
    expect(screen.queryByText("second body")).not.toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "Hide" })[0]!);
    expect(screen.queryByText("third body")).not.toBeInTheDocument();
  });

  it("Restore is offered only on non-current, non-first versions and confirms first", async () => {
    useSkillVersions.mockReturnValue({ data: THREE, isLoading: false, isError: false });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithIntl(<VersionsTab skillId="sk1" currentVersion={3} />);
    const buttons = screen.getAllByRole("button", { name: "Restore" });
    expect(buttons).toHaveLength(1);
    await userEvent.click(buttons[0]!);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(restoreMutate).toHaveBeenCalledWith({ id: "sk1", version: 2 });
  });

  it("does not restore when the confirmation is declined", async () => {
    useSkillVersions.mockReturnValue({ data: THREE, isLoading: false, isError: false });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWithIntl(<VersionsTab skillId="sk1" currentVersion={3} />);
    await userEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(restoreMutate).not.toHaveBeenCalled();
  });

  it("shows an error state", () => {
    useSkillVersions.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });
    renderWithIntl(<VersionsTab skillId="sk1" currentVersion={1} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load versions.");
  });
});
