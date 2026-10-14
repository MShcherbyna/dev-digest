import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, waitFor, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const apiPut = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: apiGet, post: apiPost, put: apiPut, del: vi.fn() },
}));

import { ApiError } from "@/lib/api";
import type { EvalCase, EvalCaseResult } from "@/lib/hooks/eval";
import { EvalCaseModal } from "./EvalCaseModal";

const AGENT = { id: "ag1", name: "Security Reviewer", provider: "openai", model: "gpt-4.1" } as Agent;
const DIFF = "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,2 @@\n ctx\n+added";
const EXPECTED_ITEM = { expect: "must_find", file: "src/a.ts", start_line: 2 };

const result = (o: Partial<EvalCaseResult>): EvalCaseResult => ({
  id: "res1",
  case_id: "case1",
  eval_run_id: null,
  status: "passed",
  ran_at: "2026-01-01T00:00:00Z",
  finished_at: "2026-01-01T00:00:02Z",
  expected_count: 1,
  got_count: 1,
  kept_count: 1,
  dropped_count: 0,
  duration_ms: 1800,
  cost_usd: 0.0216,
  error_reason: null,
  ...o,
});
const stored = (o: Partial<EvalCase> = {}): EvalCase => ({
  id: "case1",
  agent_id: "ag1",
  name: "stripe-key-leak",
  origin: "manual",
  input_meta: { title: "Add Stripe", body: "Wire payments" },
  expected_output: [{ expect: "must_find", file: "src/a.ts", start_line: 2, severity: "CRITICAL" }],
  notes: null,
  source_finding_id: null,
  source_pr_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  latest_result: null,
  input_diff: DIFF,
  ...o,
});

let db: EvalCase | null;

beforeEach(() => {
  db = null;
  apiGet.mockImplementation(async (path: string) => {
    if (path === "/eval-cases/case1" && db) return db;
    throw new Error(`unexpected GET ${path}`);
  });
  apiPost.mockImplementation(async (path: string) => {
    if (path === "/agents/ag1/eval-cases") {
      db = stored({ name: "new-case", latest_result: null });
      return db;
    }
    if (path === "/eval-cases/case1/run") return { result_id: "res1" };
    throw new Error(`unexpected POST ${path}`);
  });
  apiPut.mockImplementation(async (_p: string, body: Partial<EvalCase>) => {
    db = { ...db!, ...body } as EvalCase;
    return db;
  });
});

afterEach(() => {
  cleanup();
  apiGet.mockReset();
  apiPost.mockReset();
  apiPut.mockReset();
});

function Harness({ caseId, onClose }: { caseId: string | null; onClose: () => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>open-modal</button>
      {open && (
        <EvalCaseModal
          agent={AGENT}
          caseId={caseId}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

async function openModal(caseId: string | null = null) {
  const onClose = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  renderWithIntl(
    <QueryClientProvider client={qc}>
      <Harness caseId={caseId} onClose={onClose} />
    </QueryClientProvider>,
  );
  const opener = screen.getByText("open-modal");
  opener.focus();
  await userEvent.click(opener);
  return { onClose, opener };
}

const nameInput = () => screen.getByRole("textbox", { name: "Name" });
const expectedBox = () => screen.getByRole("textbox", { name: "Expected output" }) as HTMLTextAreaElement;
const saveBtn = () => screen.getByRole("button", { name: "Save" });

async function fillValid() {
  await userEvent.type(nameInput(), "new-case");
  await userEvent.type(screen.getByRole("textbox", { name: "Diff" }), DIFF);
  await userEvent.clear(expectedBox());
  await userEvent.type(expectedBox(), JSON.stringify([EXPECTED_ITEM]));
}

describe("EvalCaseModal", () => {
  it("new case: Save/Run stay disabled until name, diff and expected JSON are valid; Files tab derives +/- counts; skeleton is pre-filled from the diff", async () => {
    // Catches: saving an invalid form (P1-AC-10), invalid-JSON badge not blocking Save, wrong Files-tab counts (P1-Q-4),
    // skeleton ignoring the diff's first file/added line.
    await openModal();
    expect(screen.getByRole("dialog", { name: "New eval case" })).toBeInTheDocument();
    expect(screen.getByText("Security Reviewer · simulate a PR and assert the expected output")).toBeInTheDocument();
    expect(saveBtn()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Run case" })).toBeDisabled();
    expect(screen.getByText("valid JSON")).toBeInTheDocument();

    await userEvent.type(nameInput(), "new-case");
    await userEvent.type(screen.getByRole("textbox", { name: "Diff" }), DIFF);
    expect(saveBtn()).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Files" }));
    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.getByText("−0")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Diff" }));

    await userEvent.type(expectedBox(), "oops");
    expect(screen.getByText("invalid JSON")).toBeInTheDocument();
    expect(screen.getByText("Expected output is not valid JSON")).toBeInTheDocument();
    expect(saveBtn()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Run case" })).toBeDisabled();

    await userEvent.clear(expectedBox());
    await userEvent.type(expectedBox(), "[]");
    await userEvent.click(screen.getByRole("button", { name: "Finding skeleton" }));
    expect(JSON.parse(expectedBox().value)).toEqual([
      { severity: "WARNING", category: "bug", title: "", file: "src/a.ts", start_line: 2 },
    ]);
    expect(screen.getByText("valid JSON")).toBeInTheDocument();
    expect(saveBtn()).toBeEnabled();
  });

  it("Save with 'Run on save' on creates the case, then runs it, then closes", async () => {
    // Catches: run not triggered after save (P1-AC-12), running before the case exists, modal left open.
    const { onClose } = await openModal();
    await fillValid();
    expect(screen.getByRole("switch", { name: "Run on save" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(saveBtn());

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(apiPost.mock.calls.map((c) => c[0])).toEqual(["/agents/ag1/eval-cases", "/eval-cases/case1/run"]);
    expect(apiPost.mock.calls[0]![1]).toEqual({
      name: "new-case",
      input_diff: DIFF,
      input_meta: { title: "", body: "" },
      expected_output: [EXPECTED_ITEM],
    });
  });

  it("Save with 'Run on save' off only creates the case", async () => {
    // Catches: the toggle being ignored (an unwanted LLM run costs money).
    const { onClose } = await openModal();
    await fillValid();
    await userEvent.click(screen.getByRole("switch", { name: "Run on save" }));
    await userEvent.click(saveBtn());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(apiPost.mock.calls.map((c) => c[0])).toEqual(["/agents/ag1/eval-cases"]);
  });

  it("Run case on an unsaved form saves first, keeps the modal open, and shows the result panel text", async () => {
    // Catches: running before saving (server runs stored inputs, P1 plan 1.20), panel text/format
    // ('expected N, got M · 1.8s · $0.02'), modal closing on Run case.
    const { onClose } = await openModal();
    await fillValid();
    apiPost.mockImplementation(async (path: string) => {
      if (path === "/agents/ag1/eval-cases") {
        db = stored({ name: "new-case" });
        return db;
      }
      db = stored({ name: "new-case", latest_result: result({ status: "passed" }) });
      return { result_id: "res1" };
    });
    await userEvent.click(screen.getByRole("button", { name: "Run case" }));

    expect(await screen.findByText("Last run passed")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByRole("status")).toHaveTextContent("Last run passed · expected 1 finding, got 1 · 1.8s · $0.02");
    expect(apiPost.mock.calls.map((c) => c[0])).toEqual(["/agents/ag1/eval-cases", "/eval-cases/case1/run"]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows a server 422 next to the matching field and keeps the modal open without running", async () => {
    // Catches: expectation_outside_diff swallowed or shown as a generic failure; a run after a failed save.
    const { onClose } = await openModal();
    await fillValid();
    apiPost.mockRejectedValueOnce(new ApiError("outside", 422, "expectation_outside_diff", { index: 0 }));
    await userEvent.click(saveBtn());
    expect(await screen.findByText("Expectation #1 is outside the diff")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  it("edit mode loads the stored case, updates it via PUT, and Esc closes and returns focus to the opener", async () => {
    // Catches: edit creating a duplicate instead of updating, prefill from the wrong source,
    // Esc not closing / focus not restored (R4).
    db = stored();
    const { onClose, opener } = await openModal("case1");
    expect(await screen.findByRole("dialog", { name: "Eval case · stripe-key-leak" })).toBeInTheDocument();
    expect(nameInput()).toHaveValue("stripe-key-leak");
    expect((screen.getByRole("textbox", { name: "Diff" }) as HTMLTextAreaElement).value).toBe(DIFF);
    expect(JSON.parse(expectedBox().value)).toEqual([{ expect: "must_find", file: "src/a.ts", start_line: 2, severity: "CRITICAL" }]);
    await userEvent.click(screen.getByRole("button", { name: "PR meta" }));
    expect(screen.getByDisplayValue("Add Stripe")).toBeInTheDocument();

    await userEvent.click(saveBtn());
    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1));
    expect(apiPut.mock.calls[0]![0]).toBe("/eval-cases/case1");
    expect(apiPost.mock.calls.map((c) => c[0])).toEqual(["/eval-cases/case1/run"]);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(opener).toHaveFocus();
  });

  it("Escape closes a new-case modal and focus returns to the opener", async () => {
    // Catches: keyboard users trapped in the modal / losing their place after closing.
    const { onClose, opener } = await openModal();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("result panel: errored run shows the missing-key reason with the provider", async () => {
    // Catches: error runs rendered as passed/failed, raw error codes leaking to the user.
    db = stored({ latest_result: result({ status: "error", error_reason: "missing_api_key" }) });
    await openModal("case1");
    expect(await screen.findByText("Last run errored")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByRole("status")).toHaveTextContent("Reason: No API key for openai");
  });
});
