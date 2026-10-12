import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-intl";
import { AgentsWorkspace } from "./AgentsWorkspace";

const search = { value: "tab=context" };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search.value),
}));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("./../AgentCard", () => ({ AgentCard: () => null }));
vi.mock("../../[id]/_components/AgentEditor", () => ({
  AgentEditor: ({ tab }: { tab: string }) => <div data-testid="editor-tab">{tab}</div>,
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: [] }),
  useAgentSkillCounts: () => ({ data: {} }),
  useAgent: () => ({ data: { id: "a1", name: "Security Reviewer" }, isLoading: false, isError: false }),
  useUpdateAgent: () => ({ mutate: vi.fn() }),
}));

describe("AgentsWorkspace", () => {
  it("opens the Context tab from ?tab=context instead of falling back to Config", () => {
    // Catches: VALID_TABS missing a tab the editor defines, so the Context tab silently rendered Config.
    renderWithIntl(<AgentsWorkspace id="a1" />);
    expect(screen.getByTestId("editor-tab")).toHaveTextContent("context");
  });
});
