import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  repo: { id: "r1", full_name: "acme/api" } as { id: string; full_name: string } | null,
}));

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: mocks.get, put: mocks.put },
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: mocks.repo }),
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
const REPOS = { r1: { id: "r1", full_name: "acme/api" }, r2: { id: "r2", full_name: "acme/web" } };

let stored: Record<string, string[]>;

function Harness() {
  const [repoId, setRepoId] = React.useState<"r1" | "r2">("r1");
  mocks.repo = REPOS[repoId];
  return (
    <>
      <button onClick={() => setRepoId("r1")}>to r1</button>
      <button onClick={() => setRepoId("r2")}>to r2</button>
      <ContextTab skillId="sk1" />
    </>
  );
}

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithIntl(
    <QueryClientProvider client={qc}>
      <Harness />
    </QueryClientProvider>,
  );
}

const serializes = () => screen.getByText((_, el) => el?.tagName === "PRE").textContent;

beforeEach(() => {
  // A tiny stateful "server", one list per repo: PUT stores it, the refetch after it returns it.
  stored = { r1: ["specs/b.md", "specs/a.md"], r2: [] };
  mocks.repo = REPOS.r1;
  mocks.get.mockReset().mockImplementation(async (url: string) => {
    const m = /^\/skills\/sk1\/context\?repo_id=(r\d)$/.exec(url);
    if (m) return { paths: stored[m[1]!] };
    if (url === "/repos/r1/context" || url === "/repos/r2/context") return LISTING;
    throw new Error(`unexpected GET ${url}`);
  });
  mocks.put.mockReset().mockImplementation(async (url: string, body: { paths: string[] }) => {
    stored[/repo_id=(r\d)/.exec(url)![1]!] = body.paths;
    return body;
  });
});
afterEach(cleanup);

describe("skill ContextTab", () => {
  it("AC-21/22: shows 'N of M attached', the inherit hint, eye-only previews and SERIALIZES AS with the heading plus one line per path in order", async () => {
    // Catches: wrong attached order in the box, wrong heading (Q9: screenshot heading), a badge without the total,
    // the GET missing repo_id.
    renderTab();
    expect(await screen.findByRole("heading", { name: "Project context to use" })).toBeInTheDocument();
    expect(await screen.findByText("2 of 3 attached")).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith("/skills/sk1/context?repo_id=r1");
    expect(screen.getByText("Any agent using this skill inherits these documents.")).toBeInTheDocument();
    expect(screen.getByText("≈ 30 tokens")).toBeInTheDocument();

    expect(screen.getByText("Serializes as")).toBeInTheDocument();
    expect(serializes()).toBe("## Project specifications\n- specs/b.md\n- specs/a.md");

    const preview = screen.getByRole("button", { name: "Preview specs/b.md" });
    expect(preview).not.toHaveTextContent("Preview");
  });

  it("persists a toggle immediately (full ordered list, repo_id in the URL) and updates SERIALIZES AS optimistically", async () => {
    // Catches: skill attachments needing a Save step, a PUT without repo_id, or the box going stale.
    renderTab();
    await screen.findByText("2 of 3 attached");
    await userEvent.click(screen.getByRole("checkbox", { name: "Attach specs/c.md" }));
    await waitFor(() =>
      expect(mocks.put).toHaveBeenCalledWith("/skills/sk1/context?repo_id=r1", {
        paths: ["specs/b.md", "specs/a.md", "specs/c.md"],
      }),
    );
    expect(await screen.findByText("3 of 3 attached")).toBeInTheDocument();
  });

  it("AC-37: switching r1 -> r2 -> r1 shows each repo's own list, badge and SERIALIZES AS; a toggle in flight stays on r1", async () => {
    // Catches: one repo's attachments leaking into another's view, and an in-flight toggle landing on the new repo.
    let release!: () => void;
    mocks.put.mockImplementation(
      (url: string, body: { paths: string[] }) =>
        new Promise((res) => {
          release = () => {
            stored[/repo_id=(r\d)/.exec(url)![1]!] = body.paths;
            res(body);
          };
        }),
    );
    renderTab();
    await screen.findByText("2 of 3 attached");
    await userEvent.click(screen.getByRole("checkbox", { name: "Attach specs/c.md" }));
    await screen.findByText("3 of 3 attached");

    await userEvent.click(screen.getByRole("button", { name: "to r2" }));
    expect(await screen.findByText("0 of 3 attached")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Attach specs/b.md" })).not.toBeChecked();
    expect(serializes()).toBe("## Project specifications");
    expect(mocks.put.mock.calls[0]![0]).toBe("/skills/sk1/context?repo_id=r1");

    release();
    await waitFor(() => expect(stored.r1).toEqual(["specs/b.md", "specs/a.md", "specs/c.md"]));
    expect(screen.getByText("0 of 3 attached")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "to r1" }));
    expect(await screen.findByText("3 of 3 attached")).toBeInTheDocument();
    expect(serializes()).toBe("## Project specifications\n- specs/b.md\n- specs/a.md\n- specs/c.md");
  });

  it("serializeAttachments with no paths is just the heading", () => {
    expect(serializeAttachments([])).toBe("## Project specifications");
  });
});
