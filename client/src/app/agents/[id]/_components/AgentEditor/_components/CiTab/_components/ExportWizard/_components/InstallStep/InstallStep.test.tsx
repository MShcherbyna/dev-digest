import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { ApiError } from "@/lib/api";
import { InstallStep } from "./InstallStep";

afterEach(cleanup);
const props = { repo: "acme/api", fileCount: 5, installMode: "pr" as const, onInstallMode: () => {}, updating: false, block: null, error: null, onRetry: () => {}, done: null };

describe("InstallStep", () => {
  it("shows the real file count, the docs link and the zip option (AC-13)", () => {
    renderWithIntl(<InstallStep {...props} />);
    expect(screen.getByText(/with the 5 generated files\./)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Copy files as a zip/ })).toBeInTheDocument();
    const docs = screen.getByRole("link", { name: /GitHub Action setup docs/ });
    expect(docs).toHaveAttribute("href", "https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions");
    expect(docs).toHaveAttribute("rel", "noopener noreferrer");
    expect(docs).toHaveAttribute("target", "_blank");
  });
  it("shows the multi-agent block message (AC-31)", () => {
    renderWithIntl(<InstallStep {...props} block="multi_agent_unsupported" />);
    expect(screen.getByText("Multi-agent CI support is not available yet")).toBeInTheDocument();
  });
  it("maps the failure and offers Retry (AC-16)", async () => {
    const onRetry = vi.fn();
    renderWithIntl(<InstallStep {...props} error={new ApiError("x", 422, "github_token_missing")} onRetry={onRetry} />);
    expect(screen.getByText("Add a GitHub token in Settings")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
  });
  it("shows the PR opened panel with a new-tab link (AC-14)", () => {
    renderWithIntl(<InstallStep {...props} done={{ mode: "pr", prUrl: "https://github.com/acme/api/pull/1", zipName: "z.zip" }} />);
    expect(screen.getByText("PR opened")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View pull request" })).toHaveAttribute("target", "_blank");
  });
});
