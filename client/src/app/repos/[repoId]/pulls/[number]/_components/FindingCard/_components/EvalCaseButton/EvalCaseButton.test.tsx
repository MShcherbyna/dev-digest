import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FindingRecord } from "@devdigest/shared";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";

const post = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: vi.fn(), post, put: vi.fn(), del: vi.fn() },
}));

import { ApiError } from "@/lib/api";
import type { EvalAwareFinding } from "@/lib/hooks/eval";
import { EvalCaseButton } from "./EvalCaseButton";

afterEach(() => {
  cleanup();
  post.mockReset();
});

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

/** Mounts the button one commit late (client/INSIGHTS mount-late harness) so the toast pusher is registered before any notify call. */
function Harness({ finding, qc }: { finding: EvalAwareFinding; qc: QueryClient }) {
  const [late, setLate] = React.useState(false);
  React.useEffect(() => setLate(true), []);
  return <QueryClientProvider client={qc}>{late && <EvalCaseButton finding={finding} prId="pr1" agentId="ag1" />}</QueryClientProvider>;
}
const mount = (finding: EvalAwareFinding) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  renderWithIntl(<Harness finding={finding} qc={qc} />);
  return { spy };
};

describe("EvalCaseButton", () => {
  it("is disabled with the accept-or-dismiss hint for an undecided finding and never posts", async () => {
    // Catches: creating a case from an undecided finding (P1-AC-2) / hint not reachable by AT.
    mount(FINDING);
    const btn = await screen.findByRole("button", { name: "Turn into eval case" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "Accept or dismiss this finding first");
    expect(btn).toHaveAccessibleDescription("Accept or dismiss this finding first");
    await userEvent.click(btn);
    expect(post).not.toHaveBeenCalled();
  });

  it("on 201 posts once, toasts with a link to the agent's Evals tab, flips to disabled 'In eval set' and refetches reviews", async () => {
    // Catches: missing success link (AC-3), button still clickable after creation (duplicate cases, AC-4/5), stale reviews.
    post.mockResolvedValue({ id: "case1" });
    const { spy } = mount(accepted);
    await userEvent.click(await screen.findByRole("button", { name: "Turn into eval case" }));

    expect(post).toHaveBeenCalledWith("/findings/f1/eval-case");
    const link = await screen.findByRole("link", { name: "View in Evals" });
    expect(link).toHaveAttribute("href", "/agents/ag1?tab=evals");
    expect(screen.getByText("Eval case created")).toBeInTheDocument();
    const inSet = screen.getByRole("button", { name: "In eval set" });
    expect(inSet).toBeDisabled();
    expect(spy).toHaveBeenCalledWith({ queryKey: ["reviews", "pr1"] });
  });

  it("shows 'In eval set' disabled when the finding already has eval_case_id", async () => {
    // Catches: a second case being creatable for an already-covered finding.
    mount({ ...accepted, eval_case_id: "case9" });
    expect(await screen.findByRole("button", { name: "In eval set" })).toBeDisabled();
  });

  it("on 409 flips to 'In eval set' silently (no error toast) and refetches reviews", async () => {
    // Catches: a race (second tab) surfacing an error toast instead of reconciling (plan 1.18).
    post.mockRejectedValue(new ApiError("exists", 409, "eval_case_exists"));
    const { spy } = mount(accepted);
    await userEvent.click(await screen.findByRole("button", { name: "Turn into eval case" }));
    expect(await screen.findByRole("button", { name: "In eval set" })).toBeDisabled();
    expect(screen.queryByText("Could not create the eval case")).not.toBeInTheDocument();
    expect(screen.queryByText("Eval case created")).not.toBeInTheDocument();
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["reviews", "pr1"] }));
  });

  it("on 422 shows the coded error toast, on network failure the network one, and stays clickable", async () => {
    // Catches: error codes collapsed into a generic message, or the button locking after a failure.
    post.mockRejectedValueOnce(new ApiError("bad", 422, "range_outside_diff"));
    mount(accepted);
    const btn = await screen.findByRole("button", { name: "Turn into eval case" });
    await userEvent.click(btn);
    expect(await screen.findByText("The finding's lines are outside the diff")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View in Evals" })).not.toBeInTheDocument();

    post.mockRejectedValueOnce(new ApiError("down", 0));
    await userEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(await screen.findByText("Could not reach the DevDigest engine")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeEnabled();
  });
});
