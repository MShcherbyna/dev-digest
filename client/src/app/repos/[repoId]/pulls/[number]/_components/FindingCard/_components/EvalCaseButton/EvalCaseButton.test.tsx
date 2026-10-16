import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import type { FindingRecord } from "@devdigest/shared";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: apiGet, post: apiPost, put: vi.fn(), del: vi.fn() },
}));

import { ApiError } from "@/lib/api";
import type { EvalAwareFinding, EvalCaseBody } from "@/lib/hooks/eval";
import { EvalCaseButton } from "./EvalCaseButton";

afterEach(() => {
  cleanup();
  apiGet.mockReset();
  apiPost.mockReset();
});

const AGENT: Agent = { id: "ag1", name: "Security Reviewer", provider: "openai", model: "gpt-4.1" } as Agent;
const DRAFT: EvalCaseBody = {
  name: "hardcoded-secret",
  input_diff: "--- a/src/config.ts\n+++ b/src/config.ts\n@@ -10,1 +10,2 @@\n ctx\n+key",
  input_meta: { title: "Add config", body: "" },
  expected_output: [{ expect: "must_find", file: "src/config.ts", start_line: 11 }],
};

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded secret",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "r",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};
const accepted: EvalAwareFinding = { ...FINDING, accepted_at: "2026-01-01T00:00:00Z" };

function mount(finding: EvalAwareFinding, agentId: string | null = "ag1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  renderWithIntl(
    <QueryClientProvider client={qc}>
      <EvalCaseButton finding={finding} prId="pr1" agentId={agentId} />
    </QueryClientProvider>,
  );
}

describe("EvalCaseButton", () => {
  it("is disabled with the accept-or-dismiss hint for an undecided finding and never fetches a preview", async () => {
    // Catches: creating a case from an undecided finding (P1-AC-2) / hint not reachable by AT.
    mount(FINDING);
    const btn = await screen.findByRole("button", { name: "Turn into eval case" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "Accept or dismiss this finding first");
    expect(btn).toHaveAccessibleDescription("Accept or dismiss this finding first");
    await userEvent.click(btn);
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("is disabled when no agentId is known for the finding", async () => {
    mount(accepted, null);
    const btn = await screen.findByRole("button", { name: "Turn into eval case" });
    expect(btn).toBeDisabled();
  });

  it("shows 'In eval set' disabled when the finding already has eval_case_id", async () => {
    mount({ ...accepted, eval_case_id: "case9" });
    expect(await screen.findByRole("button", { name: "In eval set" })).toBeDisabled();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("opens the preview modal showing the draft diff, confirms, posts to the finding endpoint, toasts with an Evals link, and flips to 'In eval set'", async () => {
    // Catches: creating the case straight away instead of showing a confirm-first preview (the bug this fixes).
    apiGet.mockImplementation(async (path: string) => {
      if (path === "/findings/f1/eval-case/preview") return DRAFT;
      if (path === "/agents/ag1") return AGENT;
      throw new Error(`unexpected GET ${path}`);
    });
    apiPost.mockResolvedValue({ id: "case1" });
    mount(accepted);

    await userEvent.click(await screen.findByRole("button", { name: "Turn into eval case" }));
    expect(apiPost).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("textbox", { name: "Diff" })).toHaveValue(DRAFT.input_diff);
    expect(within(dialog).getByRole("textbox", { name: "Diff" })).toHaveAttribute("readonly");
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue(DRAFT.name);

    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/findings/f1/eval-case", expect.anything()));
    const link = await screen.findByRole("link", { name: "View in Evals" });
    expect(link).toHaveAttribute("href", "/agents/ag1?tab=evals");
    expect(screen.getByText("Eval case created")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "In eval set" })).toBeDisabled();
  });

  it("on a 409 race (case already created elsewhere) closes the modal, toasts success, and flips to 'In eval set'", async () => {
    apiGet.mockImplementation(async (path: string) => {
      if (path === "/findings/f1/eval-case/preview") return DRAFT;
      if (path === "/agents/ag1") return AGENT;
      throw new Error(`unexpected GET ${path}`);
    });
    apiPost.mockRejectedValue(new ApiError("exists", 409, "eval_case_exists"));
    mount(accepted);

    await userEvent.click(await screen.findByRole("button", { name: "Turn into eval case" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("button", { name: "In eval set" })).toBeDisabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("on a preview-load failure (422) toasts the coded error and keeps the button clickable, without opening a modal", async () => {
    apiGet.mockImplementation(async (path: string) => {
      if (path === "/findings/f1/eval-case/preview") {
        throw new ApiError("bad", 422, "range_outside_diff");
      }
      throw new Error(`unexpected GET ${path}`);
    });
    mount(accepted);

    await userEvent.click(await screen.findByRole("button", { name: "Turn into eval case" }));
    expect(await screen.findByText("The finding's lines are outside the diff")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeEnabled();
  });
});
