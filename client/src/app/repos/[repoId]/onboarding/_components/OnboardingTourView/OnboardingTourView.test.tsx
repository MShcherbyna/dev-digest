import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import type { OnboardingState, OnboardingTour } from "@/lib/hooks/onboarding";

const ctx = vi.hoisted(() => ({
  repos: [{ id: "r1", name: "payments-api", full_name: "acme/payments-api" }] as {
    id: string;
    name: string;
    full_name: string;
  }[],
  reposLoaded: true,
  notFound: false,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1" }),
  useRouter: () => ({ push: vi.fn() }),
}));
// The shell pulls in the whole sidebar/repo stack; the page body is what is under test.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    activeRepo: ctx.repos[0] ?? null,
    repos: ctx.repos,
    reposLoaded: ctx.reposLoaded,
  }),
  useRepoNotFound: () => ctx.notFound,
}));

import { OnboardingTourView } from "./OnboardingTourView";

const TOUR: OnboardingTour = {
  repo_id: "r1",
  generated_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  commit_sha: "a1b2c3d",
  files_indexed: 12450,
  partial_index: false,
  architecture: {
    summary: "The entry point is `src/server.ts`; routes live in `src/ghost.ts`.",
    diagram: {
      nodes: [
        { id: "client", label: "client", kind: "external" },
        { id: "server", label: "server.ts", kind: "entry" },
      ],
      edges: [{ from: "client", to: "server" }],
    },
  },
  critical_paths: [
    { path: "src/server.ts", description: "boot sequence" },
    { path: "src/api/public/charges.ts", description: "charge API" },
  ],
  run_locally: [
    { command: "pnpm install" },
    { command: "cp .env.example .env # add OPENAI + STRIPE keys" },
  ],
  reading_path: [{ path: "src/server.ts", reason: "start here" }],
  first_tasks: [
    { title: "Add a /health readiness probe", path: "src/api/public/health.ts", path_kind: "new_file", complexity: "low" },
    { title: "Rework the rate limiter", path: "src/ratelimit.ts", path_kind: "file", complexity: "high" },
  ],
};

const STATE: OnboardingState = {
  cloned: true,
  generating: false,
  index: { status: "full", last_indexed_sha: "a1b2c3d", files_indexed: 12450 },
  stale: false,
  tour: TOUR,
};

const SECTIONS = ["Architecture overview", "Critical paths", "How to run locally", "Guided reading path", "First tasks"];

interface Reply {
  status?: number;
  body: unknown;
}
const net = vi.hoisted(() => ({
  get: null as unknown as () => unknown,
  post: null as unknown as () => { status?: number; body: unknown },
  calls: [] as { method: string; path: string; body?: unknown }[],
}));
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const method = init?.method ?? "GET";
  net.calls.push({ method, path: url.replace(/^https?:\/\/[^/]+/, ""), body: init?.body });
  const reply: Reply = method === "POST" ? net.post() : { body: net.get() };
  return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
});

const writeText = vi.fn();
const scrollIntoView = vi.fn();
const posts = () => net.calls.filter((c) => c.method === "POST");

function setState(patch: Partial<OnboardingState>) {
  net.get = () => ({ ...STATE, ...patch });
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return renderWithIntl(
    <QueryClientProvider client={client}>
      <OnboardingTourView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  ctx.repos = [{ id: "r1", name: "payments-api", full_name: "acme/payments-api" }];
  ctx.reposLoaded = true;
  ctx.notFound = false;
  net.calls = [];
  net.post = () => ({ body: { tour: TOUR } });
  setState({});
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView;
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OnboardingTourView", () => {
  it("AC-15/16/17: renders header, five nav entries and five cards in order, with grounded Open links and complexity text", async () => {
    // Catches: wrong section order, missing header pieces, an Open link without a pinned sha / safe rel, complexity carried by colour only.
    renderView();

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Onboarding for payments-api");
    expect(screen.getByText("Generated from index of 12,450 files · last refreshed 2h ago")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Share link" })).toBeInTheDocument();

    const nav = screen.getByRole("navigation", { name: "ON THIS PAGE" });
    expect(within(nav).getAllByRole("button").map((b) => b.textContent)).toEqual(SECTIONS);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(SECTIONS);

    expect(screen.getByRole("img", { name: /Architecture diagram: client, server\.ts/ })).toBeInTheDocument();
    const open = screen.getByRole("link", { name: "Open src/api/public/charges.ts" });
    expect(open).toHaveAttribute("href", "https://github.com/acme/payments-api/blob/a1b2c3d/src/api/public/charges.ts");
    expect(open).toHaveAttribute("target", "_blank");
    expect(open).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("High complexity")).toBeInTheDocument();
    expect(screen.getByText("Low complexity")).toBeInTheDocument();
  });

  it("AC-16/31: a null diagram renders prose only, and empty lists show their messages", async () => {
    // Catches: a crash / empty box when the diagram was rejected, silent blank sections.
    setState({
      tour: {
        ...TOUR,
        architecture: { summary: "Just prose.", diagram: null },
        critical_paths: [],
        run_locally: [],
        reading_path: [],
        first_tasks: [],
      },
    });
    renderView();

    expect(await screen.findByText("Just prose.")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Architecture diagram/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("Not enough index data — resync and regenerate")).toHaveLength(3);
    expect(
      screen.getByText("No run commands found in package.json, docker-compose, .env.example or README"),
    ).toBeInTheDocument();
  });

  it("AC-18/19/30: copy writes the exact stored command and the share URL; a rejected write shows the error toast", async () => {
    // Catches: stripped `# comment` on copy, wrong share URL, success toast shown after a failed write.
    renderView();
    await screen.findByRole("heading", { level: 1 });

    await userEvent.click(screen.getByRole("button", { name: "Copy command: cp .env.example .env # add OPENAI + STRIPE keys" }));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
    expect(writeText).toHaveBeenLastCalledWith("cp .env.example .env # add OPENAI + STRIPE keys");

    await userEvent.click(screen.getByRole("button", { name: "Share link" }));
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
    expect(writeText).toHaveBeenLastCalledWith(`${window.location.origin}/repos/r1/onboarding`);

    writeText.mockRejectedValue(new Error("denied"));
    await userEvent.click(screen.getByRole("button", { name: "Share link" }));
    await userEvent.click(screen.getByRole("button", { name: "Copy command: pnpm install" }));
    await waitFor(() => expect(screen.getAllByText("Couldn’t copy to clipboard")).toHaveLength(2));
  });

  it("AC-20/25: stale and partial notices show only when applicable; the stale action POSTs", async () => {
    // Catches: notices always/never shown, stale action not wired to generate.
    setState({ stale: true, tour: { ...TOUR, partial_index: true } });
    renderView();

    const stale = (await screen.findByText("Index updated since this tour was generated")).closest("[role=status]") as HTMLElement;
    expect(screen.getByText(/generated from a partial index/)).toBeInTheDocument();
    await userEvent.click(within(stale).getByRole("button", { name: "Regenerate" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]!.path).toBe("/repos/r1/onboarding");

    cleanup();
    setState({});
    renderView();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText("Index updated since this tour was generated")).not.toBeInTheDocument();
    expect(screen.queryByText(/generated from a partial index/)).not.toBeInTheDocument();
  });

  it("AC-21: while the server reports generating, Regenerate is disabled and relabelled", async () => {
    // Catches: double-submit while a run is in flight (the server would 409).
    setState({ generating: true });
    renderView();

    const btn = await screen.findByRole("button", { name: "Regenerating…" });
    expect(btn).toBeDisabled();
    expect(posts()).toHaveLength(0);
  });

  it("AC-22: a failed regenerate keeps the tour and toasts; generation_in_progress stays silent", async () => {
    // Catches: wiping the existing tour on failure, a toast for the benign 409.
    net.post = () => ({ status: 502, body: { error: { code: "provider_error", message: "Upstream exploded" } } });
    renderView();
    await screen.findByRole("heading", { level: 1 });

    await userEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(await screen.findByText("Upstream exploded")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();

    net.post = () => ({ status: 409, body: { error: { code: "generation_in_progress", message: "Already running" } } });
    await userEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(screen.queryByText("Already running")).not.toBeInTheDocument();
  });

  it("AC-22/23: empty state offers Generate (no nav); failure shows Retry that POSTs again, or the API-keys link", async () => {
    // Catches: wrong empty copy / stray nav, Retry not re-POSTing, missing_api_key not pointing at settings.
    setState({ tour: null });
    net.post = () => ({ status: 502, body: { error: { code: "provider_error", message: "boom" } } });
    renderView();

    expect(await screen.findByText("Generate onboarding tour", { selector: "h1, h2, h3, div, p" })).toBeInTheDocument();
    expect(screen.getByText("DevDigest indexes the repo and writes a guided tour: architecture, critical paths, how to run, a reading order, and first tasks. Takes 30–60s and ~5,000 tokens.")).toBeInTheDocument();
    expect(screen.queryByText("ON THIS PAGE")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Generate onboarding tour/ }));

    expect(await screen.findByText("Couldn’t generate the onboarding tour")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Retry/i }));
    await waitFor(() => expect(posts()).toHaveLength(2));

    net.post = () => ({ status: 500, body: { error: { code: "missing_api_key", message: "no key" } } });
    await userEvent.click(screen.getByRole("button", { name: /Retry/i }));
    const link = await screen.findByRole("link", { name: "Settings → API Keys" });
    expect(link).toHaveAttribute("href", "/settings/api-keys");
  });

  it("AC-24: not cloned without a tour has no generate button; with a tour Regenerate is disabled but the tour is readable", async () => {
    // Catches: offering generate for an uncloned repo (always 409), hiding an existing tour.
    setState({ tour: null, cloned: false });
    renderView();
    expect(await screen.findByText("Repository not cloned")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Generate/ })).not.toBeInTheDocument();

    cleanup();
    setState({ cloned: false });
    renderView();
    expect(await screen.findByRole("button", { name: "Regenerate" })).toBeDisabled();
    expect(screen.getByText(/no local clone/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Critical paths" })).toBeInTheDocument();
  });

  it("AC-24: load error shows Retry that refetches; no repositories shows the select-a-repository state, not the skeleton", async () => {
    // Catches: a dead error state, "Select a repository" flashing before repos load (client INSIGHTS 2026-09-18).
    net.get = () => STATE;
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: { code: "x", message: "load boom" } }), { status: 500 }));
    renderView();
    expect(await screen.findByText("Couldn’t load the onboarding tour")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Retry/i }));
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();

    cleanup();
    ctx.repos = [];
    ctx.reposLoaded = false;
    renderView();
    expect(screen.queryByText("Select a repository")).not.toBeInTheDocument();
    cleanup();
    ctx.reposLoaded = true;
    renderView();
    expect(await screen.findByText("Select a repository")).toBeInTheDocument();
  });

  it("AC-26/32/27: collapse persists across remounts and never hits the network; activating a collapsed entry expands, saves, scrolls and marks it current", async () => {
    // Catches: collapse state lost on remount, leaked to the server, a collapsed target section that the nav cannot reveal.
    renderView();
    await screen.findByRole("heading", { level: 1 });

    const critical = screen.getByRole("button", { name: "Collapse Critical paths" });
    expect(critical).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(critical);
    expect(screen.getByRole("button", { name: "Expand Critical paths" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("charge API", { exact: false })).not.toBeInTheDocument();

    cleanup();
    renderView();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByRole("button", { name: "Expand Critical paths" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse First tasks" })).toBeInTheDocument();
    expect(net.calls.every((c) => c.method === "GET" && c.body === undefined)).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Collapse First tasks" }));
    expect(JSON.parse(localStorage.getItem("dd-onboarding-collapsed")!)).toEqual({ "critical-paths": true, "first-tasks": true });
    const nav = screen.getByRole("navigation", { name: "ON THIS PAGE" });
    await userEvent.click(within(nav).getByRole("button", { name: "First tasks" }));
    expect(screen.getByRole("button", { name: "Collapse First tasks" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("dd-onboarding-collapsed")!)).toEqual({ "critical-paths": true });
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(within(nav).getByRole("button", { name: "First tasks" })).toHaveAttribute("aria-current", "location");
    expect(within(nav).getByRole("button", { name: "Architecture overview" })).not.toHaveAttribute("aria-current");
  });

  it("AC-26: unavailable storage means everything is expanded and toggling does not throw", async () => {
    // Catches: a thrown SecurityError (private mode) crashing the whole page.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderView();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getAllByRole("button", { name: /^Collapse / })).toHaveLength(5);
    await userEvent.click(screen.getByRole("button", { name: "Collapse Critical paths" }));
    expect(screen.getByRole("button", { name: "Expand Critical paths" })).toBeInTheDocument();
  });

  it("AC-28/33 + security: long paths keep the full text in title; model prose cannot inject script, javascript: links, or turn paths into links", async () => {
    // Catches: untruncated layout break without tooltip, XSS via model prose, unverified prose paths becoming clickable.
    const longPath = `src/${"deep/".repeat(40)}file.ts`;
    expect(longPath.length).toBeGreaterThan(200);
    setState({
      tour: {
        ...TOUR,
        architecture: {
          summary: "Entry `src/ghost.ts` here.\n\n<script>window.__pwned = 1</script>\n\n[x](javascript:alert(1))",
          diagram: null,
        },
        reading_path: [{ path: longPath, reason: "long" }],
      },
    });
    const { container } = renderView();
    await screen.findByRole("heading", { level: 1 });

    expect(screen.getByTitle(longPath)).toHaveTextContent(longPath);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector('a[href^="javascript:" i]')).toBeNull();
    const ghost = screen.getByText("src/ghost.ts");
    expect(ghost.closest("a")).toBeNull();
  });
});
