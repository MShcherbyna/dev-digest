import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { ciRun } from "@/test/ci-fixtures";
import { CiRunsTable } from "./CiRunsTable";

afterEach(cleanup);
const base = { isLoading: false, isError: false, onRetry: () => {}, empty: <p>none</p> };

describe("CiRunsTable", () => {
  it("renders the columns and a run, with a safe job link", () => {
    // Catches: AC-30 columns/values; job link only for https://github.com/ with noopener.
    renderWithIntl(<CiRunsTable {...base} runs={[ciRun(), ciRun({ id: "r2", job_url: "javascript:alert(1)", verdict: null, cost_usd: null })]} />);
    for (const h of ["Timestamp", "Repository", "Pull request", "Agent", "Source", "Dur.", "Findings", "Verdict", "Cost", "Status", "Job"])
      expect(screen.getByRole("columnheader", { name: h })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Open the GitHub job for PR #12/ });
    expect(link).toHaveAttribute("href", "https://github.com/acme/api/actions/runs/1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    const second = screen.getAllByRole("row")[2]!;
    expect(within(second).getAllByText("—").length).toBeGreaterThan(0);
  });
  it("shows the loading, error (with Retry) and empty states", async () => {
    const retry = vi.fn();
    const { rerender } = renderWithIntl(<CiRunsTable {...base} runs={undefined} isLoading />);
    expect(document.querySelector("[aria-busy='true']")).toBeTruthy();
    cleanup();
    renderWithIntl(<CiRunsTable {...base} runs={undefined} isError onRetry={retry} />);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalled();
    cleanup();
    renderWithIntl(<CiRunsTable {...base} runs={[]} />);
    expect(screen.getByText("none")).toBeInTheDocument();
    void rerender;
  });
});
