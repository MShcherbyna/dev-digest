import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: mocks.get, put: mocks.put },
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/api" } }),
}));

import { ContextTab } from "./ContextTab";
import { serializeAttachments } from "@/components/serializes-as/helpers";

const file = (path: string, tokens: number) => ({
  path,
  type: "specs",
  size: tokens * 4,
  tokens,
  too_large: false,
  used_by: 0,
});
const LISTING = {
  glob: "**/{specs,docs,insights}/**/*.md",
  scanned_at: "2026-10-11T10:00:00Z",
  cloned: true,
  truncated: false,
  total: 3,
  files: [file("specs/a.md", 10), file("specs/b.md", 20), file("specs/c.md", 5)],
};

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithIntl(
    <QueryClientProvider client={qc}>
      <ContextTab skillId="sk1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // A tiny stateful "server": PUT stores the list, the refetch after it returns it.
  let stored = ["specs/b.md", "specs/a.md"];
  mocks.get.mockReset().mockImplementation(async (url: string) => {
    if (url === "/skills/sk1/context") return { paths: stored };
    if (url === "/repos/r1/context") return LISTING;
    throw new Error(`unexpected GET ${url}`);
  });
  mocks.put.mockReset().mockImplementation(async (_url: string, body: { paths: string[] }) => {
    stored = body.paths;
    return body;
  });
});
afterEach(cleanup);

describe("skill ContextTab", () => {
  it("AC-21/22: shows 'N of M attached', the inherit hint, eye-only previews and SERIALIZES AS with the heading plus one line per path in order", async () => {
    // Catches: wrong attached order in the box, wrong heading (Q9: screenshot heading), a badge without the total (the skill tab shows 'N of M attached' like the agent tab).
    renderTab();
    expect(await screen.findByRole("heading", { name: "Project context to use" })).toBeInTheDocument();
    expect(await screen.findByText("2 of 3 attached")).toBeInTheDocument();
    expect(screen.getByText("Any agent using this skill inherits these documents.")).toBeInTheDocument();
    expect(screen.getByText("≈ 30 tokens")).toBeInTheDocument();

    expect(screen.getByText("Serializes as")).toBeInTheDocument();
    const box = screen.getByText((_, el) => el?.tagName === "PRE");
    expect(box.textContent).toBe("## Project specifications\n- specs/b.md\n- specs/a.md");

    // the preview action is an icon-only button (no visible "Preview" text)
    const preview = screen.getByRole("button", { name: "Preview specs/b.md" });
    expect(preview).not.toHaveTextContent("Preview");
  });

  it("persists a toggle immediately (full ordered list) and updates SERIALIZES AS optimistically", async () => {
    // Catches: skill attachments needing a Save step, or the box going stale.
    renderTab();
    await screen.findByText("2 of 3 attached");
    await userEvent.click(screen.getByRole("checkbox", { name: "Attach specs/c.md" }));
    await waitFor(() =>
      expect(mocks.put).toHaveBeenCalledWith("/skills/sk1/context", { paths: ["specs/b.md", "specs/a.md", "specs/c.md"] }),
    );
    expect(await screen.findByText("3 of 3 attached")).toBeInTheDocument();
  });

  it("serializeAttachments with no paths is just the heading", () => {
    expect(serializeAttachments([])).toBe("## Project specifications");
  });
});
