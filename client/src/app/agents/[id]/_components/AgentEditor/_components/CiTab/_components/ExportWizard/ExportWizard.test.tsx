import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, waitFor, within, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { AGENT, PREVIEW } from "@/test/ci-fixtures";
import { api, ApiError } from "@/lib/api";
import { ExportWizard } from "./ExportWizard";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), patch: vi.fn() },
}));
const post = vi.mocked(api.post);
const repos = [{ id: "r1", full_name: "acme/api" }] as never;

function open(onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  renderWithIntl(
    <QueryClientProvider client={qc}>
      <ExportWizard agent={AGENT} mode="add" installations={[]} repos={repos} activeRepo={{ full_name: "acme/api" }} onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
}
const next = () => userEvent.click(screen.getByRole("button", { name: /Continue/ }));
const stepNow = () => within(screen.getByRole("navigation", { name: "Export steps" })).getAllByRole("listitem").find((li) => li.getAttribute("aria-current") === "step")?.textContent;

beforeEach(() => {
  vi.clearAllMocks();
  post.mockImplementation(async (path: string) => {
    if (path.endsWith("/ci/preview")) return PREVIEW as never;
    if (path.endsWith("/export-ci")) return { installation: {}, files: PREVIEW.files, pr_url: "https://github.com/acme/api/pull/1" } as never;
    throw new Error(path);
  });
});
afterEach(cleanup);

describe("ExportWizard", () => {
  it("opens on Target with the title, subtitle and aria-current step (AC-2)", () => {
    open();
    expect(screen.getByText("Export to CI")).toBeInTheDocument();
    expect(screen.getByText("Run Security Reviewer automatically on pull requests")).toBeInTheDocument();
    expect(stepNow()).toBe("Target");
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  });

  it("Preview lists the files, defaults to the editable workflow and notes OpenRouter on the manifest (AC-4, 6)", async () => {
    open();
    await next();
    expect(await screen.findByText(".devdigest/runner/index.js")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Edit \.github\/workflows/ })).toBeInTheDocument();
    expect(screen.getByText("editable")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /runner\/index\.js/ }));
    expect(screen.getByText("generated, not editable")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Edit/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /agents\/security-reviewer\.yaml/ }));
    expect(screen.getByText("Runs via OpenRouter as openai/gpt-4.1")).toBeInTheDocument();
  });

  it("invalid workflow YAML shows the line and disables Continue (AC-9)", async () => {
    open();
    await next();
    const editor = await screen.findByRole("textbox", { name: /Edit/ });
    fireEvent.change(editor, { target: { value: "a: 1\nb: [1, 2\n" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/Invalid YAML — line \d+/);
    expect(screen.getByRole("button", { name: /Continue/ })).toBeDisabled();
  });

  it("Configure: defaults, secrets, empty-trigger rule, regenerate vs edited workflow (AC-9, 10, 11, 12)", async () => {
    open();
    await next();
    fireEvent.change(await screen.findByRole("textbox", { name: /Edit/ }), { target: { value: "name: edited\n" } });
    await next();
    expect(stepNow()).toBe("Configure");
    expect(screen.getByRole("button", { name: "pull_request:opened" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "pull_request:reopened" })).toHaveAttribute("aria-pressed", "false");
    expect(await screen.findByText("not set")).toBeInTheDocument();
    expect(screen.getByText("ready")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /GitHub review/ })).toBeChecked();
    post.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "pull_request:reopened" }));
    expect(screen.getByText("Workflow edited manually — trigger changes not applied")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "pull_request:reopened" }));
    await userEvent.click(screen.getByRole("button", { name: "pull_request:opened" }));
    await userEvent.click(screen.getByRole("button", { name: "pull_request:synchronize" }));
    expect(screen.getByText("Select at least one trigger")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue/ })).toBeDisabled();
  });

  it("Configure regenerates the preview on a change when the workflow is untouched", async () => {
    open();
    await next();
    await screen.findByRole("textbox", { name: /Edit/ });
    await next();
    await screen.findByText("not set");
    post.mockClear();
    await userEvent.click(screen.getByRole("radio", { name: /PR comment/ }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/agents/ag1/ci/preview", expect.objectContaining({ post_as: "pr_comment" })));
  });

  it("Install posts the export with the edit and shows PR opened (AC-14)", async () => {
    open();
    await next();
    fireEvent.change(await screen.findByRole("textbox", { name: /Edit/ }), { target: { value: "name: edited\n" } });
    await next();
    await screen.findByText("not set");
    await next();
    expect(screen.getByText(/with the 4 generated files/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(await screen.findByText("PR opened")).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith("/agents/ag1/export-ci", { repo: "acme/api", target: "gha", post_as: "github_review", triggers: ["opened", "synchronize"], mode: "pr", workflow: "name: edited\n" });
  });

  it("a 409 disables Install; other failures keep the wizard with Retry (AC-16, 31)", async () => {
    open();
    await next();
    await screen.findByRole("textbox", { name: /Edit/ });
    await next();
    await screen.findByText("not set");
    await next();
    post.mockRejectedValueOnce(new ApiError("x", 502, "github_error"));
    await userEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(await screen.findByText("GitHub or the network failed — try again")).toBeInTheDocument();
    post.mockRejectedValueOnce(new ApiError("x", 409, "multi_agent_unsupported"));
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect((await screen.findAllByText("Multi-agent CI support is not available yet")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Install" })).toBeDisabled();
  });

  it("zip mode downloads devdigest-ci-<slug>.zip (AC-17)", async () => {
    const created = vi.fn(() => "blob:x");
    URL.createObjectURL = created as never;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    open();
    await next();
    await screen.findByRole("textbox", { name: /Edit/ });
    await next();
    await screen.findByText("not set");
    await next();
    await userEvent.click(screen.getByRole("radio", { name: /Copy files as a zip/ }));
    await userEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(await screen.findByText("Files downloaded")).toBeInTheDocument();
    expect(created).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(screen.getByText(/devdigest-ci-security-reviewer\.zip/)).toBeInTheDocument();
    click.mockRestore();
  });
});
