import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import user from "@/test/user";
import { githubBlobUrl } from "@/lib/github-urls";
import type { BlastRadiusResponse, PriorPrsResponse } from "@/lib/hooks/blast";
import blast from "../../../../../../../../messages/en/blast.json";
import brief from "../../../../../../../../messages/en/brief.json";
import { BlastRadiusCard } from "./BlastRadiusCard";
import { blastStats } from "./helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DATA: BlastRadiusResponse = {
  changed_symbols: [
    { name: "rateLimit", file: "src/mw/ratelimit.ts", kind: "function" },
    { name: "bucketKey", file: "src/mw/ratelimit.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "rateLimit",
      callers: [
        { name: "a", file: "src/api/index.ts", line: 23 },
        { name: "b", file: "src/server.ts", line: 88 },
      ],
      endpoints_affected: ["GET /api/items", "POST /api/webhooks"],
      crons_affected: ["reset-rate-buckets (hourly)"],
    },
    {
      symbol: "bucketKey",
      callers: [{ name: "c", file: "src/jobs/reset.ts", line: 8 }],
      endpoints_affected: ["GET /api/items"],
      crons_affected: [],
    },
  ],
  summary: "",
  degraded: false,
  reason: null,
  ref_sha: "idx123",
};

const HISTORY: PriorPrsResponse = {
  available: true,
  history: [
    { pr_number: 401, title: "Introduce public API namespace", merged_at: "2026-03-18T10:00:00Z", author: "deepak.r", files_overlap: ["a.ts"], notes: "Original split-out." },
  ],
};

function renderCard(
  data: BlastRadiusResponse | "error",
  repoFullName: string | null = "acme/api",
  history: PriorPrsResponse = { history: [], available: false },
) {
  const fetchMock = vi.fn(async (url: string) =>
    String(url).includes("/blast/history")
      ? new Response(JSON.stringify(history), { status: 200 })
      : data === "error"
        ? new Response(JSON.stringify({ error: { code: "x", message: "boom" } }), { status: 500 })
        : new Response(JSON.stringify(data), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ blast, brief }}>
        <BlastRadiusCard prId="pr-1" repoId="repo-1" repoFullName={repoFullName} headSha="head999" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("blastStats", () => {
  it("counts changed symbols, total callers, and unique endpoints/crons", () => {
    expect(blastStats(DATA)).toEqual({ symbols: 2, callers: 3, endpoints: 2, crons: 1 });
  });
});

describe("BlastRadiusCard", () => {
  it("shows stats, the first symbol expanded with indexed-commit links, chips, and expands the second", async () => {
    renderCard(DATA);
    const first = await screen.findByRole("button", { name: /rateLimit\(\)/ });
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("2 callers")).toBeInTheDocument();
    expect(screen.getByText("symbols", { exact: false })).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "src/api/index.ts:23" });
    expect(link).toHaveAttribute("href", githubBlobUrl("acme/api", "idx123", "src/api/index.ts", 23));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("POST /api/webhooks")).toBeInTheDocument();
    expect(screen.getByText("reset-rate-buckets (hourly)")).toBeInTheDocument();

    const second = screen.getByRole("button", { name: /bucketKey\(\)/ });
    expect(second).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("src/jobs/reset.ts:8")).not.toBeInTheDocument();
    await user.click(second);
    expect(screen.getByText("src/jobs/reset.ts:8")).toBeInTheDocument();
  });

  it("renders callers as plain text without a repo, falling back to nothing linkable", async () => {
    renderCard(DATA, null);
    expect(await screen.findByText("src/api/index.ts:23")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the no-callers text and no tree", async () => {
    renderCard({ ...DATA, downstream: [] });
    expect(await screen.findByText("2 changed symbol(s), no downstream callers found.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /rateLimit/ })).not.toBeInTheDocument();
  });

  it("shows only the degraded notice when empty", async () => {
    renderCard({ ...DATA, changed_symbols: [], downstream: [], degraded: true, reason: "no_data" });
    const note = await screen.findByRole("status");
    expect(within(note).getByText("Repo index incomplete")).toBeInTheDocument();
    expect(note).toHaveTextContent("has not been indexed yet");
    expect(screen.queryByText(/no downstream callers/)).not.toBeInTheDocument();
  });

  it("shows the partial-index notice above the still-rendered tree", async () => {
    renderCard({ ...DATA, degraded: true, reason: "index_partial" });
    expect(await screen.findByRole("status")).toHaveTextContent("some callers may be missing");
    expect(screen.getByRole("button", { name: /rateLimit\(\)/ })).toBeInTheDocument();
  });

  it("shows an error with a retry button", async () => {
    renderCard("error");
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the blast radius.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("switches to the graph view, draws linked caller nodes and endpoint nodes, and switches symbol", async () => {
    renderCard(DATA);
    const graphBtn = await screen.findByRole("button", { name: /graph/i });
    expect(graphBtn).toHaveAttribute("aria-pressed", "false");
    await user.click(graphBtn);
    expect(graphBtn).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /tree/i })).toHaveAttribute("aria-pressed", "false");
    // Tree rows are gone; the graph group is there with its legend.
    expect(screen.queryByRole("button", { name: /rateLimit\(\)/ })).not.toBeInTheDocument();
    const graph = screen.getByRole("group", { name: "Blast radius graph" });
    expect(within(graph).getByText("rateLimit()")).toBeInTheDocument();
    expect(screen.getByText("endpoints affected")).toBeInTheDocument();

    // Caller nodes link to the indexed commit; endpoint and cron nodes are drawn (truncated).
    const callerLink = within(graph).getByRole("link", { name: /a — src\/api\/index\.ts:23/ });
    expect(callerLink).toHaveAttribute("href", githubBlobUrl("acme/api", "idx123", "src/api/index.ts", 23));
    expect(within(graph).getAllByRole("link")).toHaveLength(2);
    expect(within(graph).getByText("GET /api/items")).toBeInTheDocument();
    expect(within(graph).getByText("reset-rate-buc…")).toBeInTheDocument();

    // Switch to the second symbol: its single caller, its single endpoint, no cron.
    await user.click(screen.getByRole("combobox"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "bucketKey" } });
    expect(within(graph).getByText("bucketKey()")).toBeInTheDocument();
    expect(within(graph).getAllByRole("link")).toHaveLength(1);
    expect(within(graph).queryByText("reset-rate-buc…")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /tree/i }));
    expect(screen.getByRole("button", { name: /rateLimit\(\)/ })).toBeInTheDocument();
  });

  it("puts crons in their own list under the endpoints list", async () => {
    renderCard(DATA);
    const endpoints = await screen.findByRole("list", { name: "Endpoints affected" });
    const crons = screen.getByRole("list", { name: "Crons affected" });
    expect(within(crons).getByText("reset-rate-buckets (hourly)")).toBeInTheDocument();
    expect(within(endpoints).queryByText("reset-rate-buckets (hourly)")).not.toBeInTheDocument();
    expect(within(endpoints).getByText("GET /api/items")).toBeInTheDocument();
  });

  it("shows Prior PRs under both views and when the map is degraded and empty", async () => {
    renderCard(DATA, "acme/api", HISTORY);
    expect(await screen.findByRole("button", { name: /Prior PRs touching these files/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Graph" }));
    expect(screen.getByRole("button", { name: /Prior PRs touching these files/ })).toBeInTheDocument();
    cleanup();

    renderCard({ ...DATA, changed_symbols: [], downstream: [], degraded: true, reason: "no_data" }, "acme/api", HISTORY);
    expect(await screen.findByRole("button", { name: /Prior PRs touching these files/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tree" })).not.toBeInTheDocument();
  });

  it("offers a resync only for reasons a re-index can fix", async () => {
    renderCard({ ...DATA, degraded: true, reason: "no_data" });
    expect(await screen.findByRole("button", { name: "Resync index" })).toBeInTheDocument();
    cleanup();
    renderCard({ ...DATA, degraded: true, reason: "flag_off" });
    await screen.findByRole("status");
    expect(screen.queryByRole("button", { name: "Resync index" })).not.toBeInTheDocument();
  });
});
