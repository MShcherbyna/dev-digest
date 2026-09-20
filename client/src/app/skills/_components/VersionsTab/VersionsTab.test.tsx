import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-intl";

const useSkillVersions = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({ useSkillVersions: (id: string) => useSkillVersions(id) }));

import { VersionsTab } from "./VersionsTab";

afterEach(cleanup);

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
    expect(screen.getAllByText("current")).toHaveLength(1);
  });

  it("shows an error state", () => {
    useSkillVersions.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });
    renderWithIntl(<VersionsTab skillId="sk1" currentVersion={1} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load versions.");
  });
});
