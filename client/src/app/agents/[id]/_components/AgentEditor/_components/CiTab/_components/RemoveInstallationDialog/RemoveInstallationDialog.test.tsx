import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { installation } from "@/test/ci-fixtures";
import { api, ApiError } from "@/lib/api";
import { RemoveInstallationDialog } from "./RemoveInstallationDialog";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), patch: vi.fn() },
}));
const post = vi.mocked(api.post);
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

function open(onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  renderWithIntl(
    <QueryClientProvider client={qc}>
      <RemoveInstallationDialog installation={installation()} agentName="Security Reviewer" onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
}

describe("RemoveInstallationDialog", () => {
  it("shows the confirmation text and Cancel sends nothing (AC-33)", async () => {
    const onClose = open();
    expect(screen.getByText("Remove Security Reviewer from acme/api?")).toBeInTheDocument();
    expect(screen.getByText(/titled “Remove DevDigest CI review” that deletes this agent's CI files\. Past CI runs stay in DevDigest\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
  it("confirms, posts the removal and closes", async () => {
    post.mockResolvedValue({ installation: null, pr_url: "https://github.com/acme/api/pull/3" } as never);
    const onClose = open();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith("/ci/installations/i1/remove");
  });
  it("stays open with the reason and a Retry on failure (AC-36), incl. repo_not_connected", async () => {
    post.mockRejectedValueOnce(new ApiError("x", 403, "github_permission", { permission: "pull_requests" }));
    const onClose = open();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("Your GitHub token is missing the Pull requests write permission")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    post.mockRejectedValueOnce(new ApiError("x", 422, "repo_not_connected"));
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("This repository isn't connected to DevDigest")).toBeInTheDocument();
  });
});
