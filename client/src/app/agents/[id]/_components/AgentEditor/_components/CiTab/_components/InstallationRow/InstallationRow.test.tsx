import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { installation } from "@/test/ci-fixtures";
import { InstallationRow } from "./InstallationRow";

afterEach(cleanup);
const row = (o = {}, onRemove = vi.fn()) =>
  renderWithIntl(<div role="list"><InstallationRow installation={installation(o)} agentName="Security Reviewer" onRemove={onRemove} /></div>);

describe("InstallationRow", () => {
  it("shows pending / manual pending", () => {
    row();
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.getByText("manifest v2")).toBeInTheDocument();
    cleanup();
    row({ mode: "manual" });
    expect(screen.getByText("manual pending")).toBeInTheDocument();
  });
  it("shows outdated and a removing badge with the removal PR link only for github URLs", () => {
    row({ status: "outdated", last_run_status: "failed" });
    expect(screen.getByText("outdated")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    cleanup();
    row({ status: "removing", removal_pr_url: "https://github.com/acme/api/pull/9" });
    expect(screen.getByRole("link", { name: "removal PR" })).toHaveAttribute("href", "https://github.com/acme/api/pull/9");
    cleanup();
    row({ status: "removing", removal_pr_url: "http://evil.test/x" });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("Remove has the accessible name and reports the trigger", async () => {
    const onRemove = vi.fn();
    row({}, onRemove);
    await userEvent.click(screen.getByRole("button", { name: "Remove Security Reviewer from acme/api" }));
    expect(onRemove).toHaveBeenCalledWith(expect.any(HTMLElement));
  });
});
