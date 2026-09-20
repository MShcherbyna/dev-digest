import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import type { Convention } from "@/lib/hooks/conventions";

const extract = vi.fn();
const update = vi.fn();
const reject = vi.fn();
let list: Convention[] = [];

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    activeRepo: { id: "r1", full_name: "acme/ai-customer-support", default_branch: "main" },
  }),
}));
vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => ({
    data: { head_sha: "abc", conventions: list },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useExtractConventions: () => ({ mutate: extract, isPending: false }),
  useUpdateConvention: () => ({ mutate: update }),
  useRejectConvention: () => ({ mutate: reject }),
  useCreateSkillFromConventions: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ConventionsView } from "./ConventionsView";

const conv = (id: string, accepted: boolean): Convention => ({
  id,
  rule: `Rule ${id}`,
  evidence_path: `src/${id}.ts`,
  evidence_snippet: "code",
  evidence_line: 1,
  confidence: 0.9,
  accepted,
});

beforeEach(() => {
  extract.mockReset();
  update.mockReset();
  reject.mockReset();
});
afterEach(cleanup);

describe("ConventionsView", () => {
  it("empty state offers Re-scan (not Create agent) and starts a scan", async () => {
    list = [];
    renderWithIntl(<ConventionsView />);
    expect(screen.getByText("No conventions yet")).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: "Re-scan" });
    await userEvent.click(buttons[buttons.length - 1]!);
    expect(extract).toHaveBeenCalled();
  });

  it("shows the accepted counter, and Create skill enables only with an accepted convention", async () => {
    list = [conv("a", true), conv("b", false), conv("c", false)];
    renderWithIntl(<ConventionsView />);
    expect(screen.getByText("1 of 3 accepted")).toBeInTheDocument();
    expect(screen.getByText("ai-customer-support")).toBeInTheDocument();
    const create = screen.getByRole("button", { name: "Create skill" });
    expect(create).toBeEnabled();
    await userEvent.click(create);
    expect(screen.getByText("Create skill from conventions")).toBeInTheDocument();
  });

  it("Create skill is disabled with nothing accepted; Reject and Accept call the mutations", async () => {
    list = [conv("a", false)];
    renderWithIntl(<ConventionsView />);
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /Accept/ }));
    expect(update).toHaveBeenCalledWith({ id: "a", patch: { accepted: true } });
    await userEvent.click(screen.getByRole("button", { name: /Reject/ }));
    expect(reject).toHaveBeenCalledWith("a");
  });
});
