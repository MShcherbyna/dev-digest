/* PrBriefBlock flow tests. Boundaries: `fetch` (real hooks + real api module), the reviews
   and intent hooks, and the Blast radius card (its own tests) — everything else is real. */
import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import user from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { ToastProvider } from "@/lib/toast";
import type { BriefState, StoredBrief } from "@/lib/hooks/brief";
import type { PrIntent } from "@/lib/hooks/intent";
import brief from "../../../../../../../../messages/en/brief.json";
import prReview from "../../../../../../../../messages/en/prReview.json";

const h = vi.hoisted(() => ({ reviews: [] as unknown[] }));

vi.mock("@/lib/hooks/reviews", () => ({ usePrReviews: () => ({ data: h.reviews }) }));
vi.mock("@/lib/hooks/intent", () => ({
  usePrIntent: () => ({ data: { intent: INTENT }, isPending: false, isSuccess: true, isError: false, error: null }),
  useDeriveIntent: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useIsDerivingIntent: () => 0,
}));
vi.mock("../BlastRadiusCard", () => ({ BlastRadiusCard: () => <div data-testid="blast-card" /> }));

import { PrBriefBlock } from "./PrBriefBlock";

const INTENT: PrIntent = {
  pr_id: "pr1",
  intent: "Rate limit public webhooks",
  in_scope: ["Limiter middleware"],
  out_of_scope: ["Dashboard"],
  risk_areas: ["Chip risk from intent"],
  confidence: "high",
  sources: [],
  head_sha: "sha1",
  derived_at: "2026-01-01T00:00:00Z",
  model: null,
  stale: false,
};

const LONG_PATH = `${"deep/".repeat(40)}file.ts`; // > 200 chars
const SUMMARY = "Adds rate limiting to the public webhook endpoints.";

function makeBrief(over: Partial<StoredBrief> = {}): StoredBrief {
  return {
    intent: { intent: "i", in_scope: [], out_of_scope: [] },
    blast: { changed_symbols: [], downstream: [], summary: "b" },
    risks: {
      risks: [
        {
          kind: "security",
          title: "Auth surface touched",
          explanation: "The limiter runs before auth.",
          severity: "high",
          file_refs: ["src/middleware/ratelimit.ts:12-18", "package.json:34"],
        },
        { kind: "weird", title: "Odd one", explanation: "e2", severity: "low", file_refs: [] },
      ],
    },
    history: { history: [] },
    summary: SUMMARY,
    review_focus: [
      { file: "src/config.ts", line: 12, reason: "New limit constant" },
      { file: "src/middleware/ratelimit.ts", line: 24, reason: "Core limiter" },
      { file: "src/api/webhooks.ts", line: 61, reason: "Handler wiring" },
      { file: LONG_PATH, line: 3, reason: "Long path" },
    ],
    head_sha: "sha1",
    generated_at: "2026-01-01T00:00:00Z",
    provider: "openai",
    model: "gpt",
    tokens_in: 8200,
    tokens_out: 1300,
    cost_usd: 0.014,
    spec_docs: [],
    truncated: false,
    files_total: 5,
    files_sent: 5,
    ...over,
  };
}

function finding(over: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f",
    severity: "CRITICAL",
    category: "bug",
    title: "t",
    file: "a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    confidence: 0.9,
    kind: "finding",
    review_id: "r",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

function makeReview(): ReviewRecord {
  return {
    id: "rev1",
    pr_id: "pr1",
    agent_id: null,
    run_id: null,
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: null,
    score: 61,
    model: null,
    created_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
    findings: [finding({ id: "1" }), finding({ id: "2" }), finding({ id: "3", severity: "WARNING" })],
  };
}

/* ---- fake API (fetch boundary) ---- */
interface Fake {
  state: BriefState;
  getStatus: number;
  posts: number;
  /** Called on each POST; resolve with [status, body]. */
  post: () => Promise<[number, unknown]>;
}
let fake: Fake;

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === "POST" && u.endsWith("/pulls/pr1/brief/generate")) {
        fake.posts++;
        const [status, body] = await fake.post();
        return new Response(JSON.stringify(body), { status });
      }
      if (u.endsWith("/pulls/pr1/brief")) {
        return new Response(JSON.stringify(fake.state), { status: fake.getStatus });
      }
      return new Response("{}", { status: 404 });
    }),
  );
}

const ok = (b: StoredBrief): Promise<[number, unknown]> => Promise.resolve([200, { brief: b }]);
const fail = (status: number, code: string): Promise<[number, unknown]> =>
  Promise.resolve([status, { error: { code, message: code } }]);

const onOpenFile = vi.fn();
const DIFF_PATHS = ["src/config.ts", "src/middleware/ratelimit.ts", "src/api/webhooks.ts", LONG_PATH];

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function block() {
  return (
    <PrBriefBlock
      prId="pr1"
      repoId="repo1"
      repoFullName="acme/repo"
      headSha="sha1"
      diffPaths={DIFF_PATHS}
      onOpenFile={onOpenFile}
    />
  );
}

function renderBlock() {
  return renderWithIntl(<QueryClientProvider client={client()}>{block()}</QueryClientProvider>);
}

beforeEach(() => {
  h.reviews = [];
  fake = {
    state: { brief: null, stale: false, generating: false },
    getStatus: 200,
    posts: 0,
    post: () => ok(makeBrief()),
  };
  stubFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  onOpenFile.mockReset();
});

describe("PrBriefBlock", () => {
  // Catches: AC-10/29 (old "not available" hint back, Generate posting twice), AC-40 (first
  // generation showing a Generate button / no busy skeletons), AC-13 (chips vs risk cards).
  it("empty state → one Generate POST → busy skeletons without a Generate button → brief replaces the chips", async () => {
    let finish!: () => void;
    fake.post = () =>
      new Promise((res) => {
        finish = () => {
          const next = makeBrief();
          fake.state = { brief: next, stale: false, generating: false };
          res([200, { brief: next }]);
        };
      });
    renderBlock();

    expect(await screen.findByText("No brief yet")).toBeInTheDocument();
    expect(screen.queryByText("Brief not available yet.")).not.toBeInTheDocument();
    expect(screen.queryByText("Run a review or open the PR to compute it.")).not.toBeInTheDocument();
    // AC-13: with no brief the Intent card keeps its own chips and has no brief risk slot.
    expect(screen.getByText("Chip risk from intent")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Generate brief" }));

    const busy = await screen.findByLabelText("Generating brief");
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy.children).toHaveLength(3);
    // AC-40/13: placeholders only — no intent chips, exactly one Risk areas placeholder.
    expect(within(busy).queryByText("Chip risk from intent")).not.toBeInTheDocument();
    expect(within(busy).getAllByTestId("risk-areas-skeleton")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Generate brief" })).not.toBeInTheDocument();
    expect(fake.posts).toBe(1);

    finish();
    expect(await screen.findByText(SUMMARY)).toBeInTheDocument();
    expect(screen.queryByLabelText("Generating brief")).not.toBeInTheDocument();
    expect(screen.queryByText("Chip risk from intent")).not.toBeInTheDocument();
    expect(fake.posts).toBe(1);
  });

  // Catches: AC-11 (rows / badge), AC-12 (banner from latest review), AC-13/34/38 (risk cards,
  // chevron aria-expanded, severity text), AC-25 (cost line + accessible label).
  it("brief with a review: banner, cost line, risk cards (expandable) and the 4 focus rows with badge 4", async () => {
    h.reviews = [makeReview()];
    fake.state = { brief: makeBrief(), stale: false, generating: false };
    renderBlock();

    expect(await screen.findByText(SUMMARY)).toBeInTheDocument();
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText(/3 findings · 2 blockers/)).toBeInTheDocument();
    expect(screen.getByText("61")).toBeInTheDocument();

    const cost = screen.getByRole("img", { name: /^Brief cost \$0\.014, 8\.2K input and 1\.3K output tokens$/ });
    expect(cost).toHaveTextContent("$0.014");
    expect(cost).toHaveTextContent("8.2K→1.3K");

    // Risk cards replace the intent chips.
    expect(screen.queryByText("Chip risk from intent")).not.toBeInTheDocument();
    expect(screen.getByText("Risk areas")).toBeInTheDocument();
    expect(screen.getByText("Auth surface touched")).toBeInTheDocument();
    expect(screen.getByText("Odd one")).toBeInTheDocument(); // unknown kind → default icon, still rendered

    const chevron = screen.getByRole("button", { name: "Show details: Auth surface touched" });
    expect(chevron).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("The limiter runs before auth.")).not.toBeInTheDocument();
    await user.click(chevron);
    const hide = screen.getByRole("button", { name: "Hide details: Auth surface touched" });
    expect(hide).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("The limiter runs before auth.")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    await user.click(hide);
    expect(screen.queryByText("The limiter runs before auth.")).not.toBeInTheDocument();

    // Review focus: 4 rows, badge "4".
    const focus = screen.getByText("Review focus — read these first").closest("section")!;
    expect(within(focus).getAllByRole("button")).toHaveLength(4);
    expect(within(focus).getByRole("button", { name: "src/config.ts:12 — New limit constant" })).toBeInTheDocument();
    expect(within(focus).getByText("4")).toBeInTheDocument();
  });

  // Catches: AC-12 (summary-only mode must not invent a verdict/score/ⓘ without a review),
  // AC-28 (no focus items → hint + badge 0).
  it("without reviews the banner is summary-only, and an empty review focus shows the hint with badge 0", async () => {
    fake.state = { brief: makeBrief({ review_focus: [] }), stale: false, generating: false };
    renderBlock();

    expect(await screen.findByText(SUMMARY)).toBeInTheDocument();
    expect(screen.queryByText("Request changes")).not.toBeInTheDocument();
    expect(screen.queryByText("PR SCORE")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Security Reviewer/ })).not.toBeInTheDocument();
    expect(screen.getByText("No specific starting point — start with Core logic in Files changed.")).toBeInTheDocument();
    const focus = screen.getByText("Review focus — read these first").closest("section")!;
    expect(within(focus).getByText("0")).toBeInTheDocument();
  });

  // Catches: AC-42 - the verdict source tooltip must be reachable by keyboard focus (not hover only)
  // and must close on blur / Escape.
  it("focusing the ⓘ shows '<agent> · <time>' and Escape / blur closes it", async () => {
    h.reviews = [makeReview()];
    fake.state = { brief: makeBrief(), stale: false, generating: false };
    renderBlock();

    const info = await screen.findByRole("button", { name: "Security Reviewer · 3h" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.focus(info);
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("Security Reviewer · 3h");
    expect(info).toHaveAttribute("aria-describedby", tip.id);
    fireEvent.keyDown(info, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.focus(info);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.blur(info);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  // Catches: AC-15 (missing facts), AC-22 (stale + Regenerate re-posts), AC-30 (truncation note).
  it("shows the missing-intent/blast, truncation and stale notices; the stale Regenerate posts once", async () => {
    fake.state = {
      brief: makeBrief({ intent: null, blast: null, truncated: true, files_sent: 200, files_total: 340 }),
      stale: true,
      generating: false,
    };
    renderBlock();

    expect(await screen.findByText(/Generated without intent/)).toBeInTheDocument();
    expect(screen.getByText(/Generated without blast radius/)).toBeInTheDocument();
    expect(screen.getByText("Based on the first 200 of 340 files")).toBeInTheDocument();
    const note = screen.getByText("PR changed since this brief was generated").parentElement!;
    await user.click(within(note).getByRole("button", { name: "Regenerate" }));
    await waitFor(() => expect(fake.posts).toBe(1));
  });

  // Catches: AC-16 (focus click opens file+line), AC-21 (range ref → first line), AC-27/39
  // (a file outside the diff must NOT navigate and must toast the exact text).
  it("opens diff files with their first line, and toasts instead of navigating for a file outside the diff", async () => {
    fake.state = { brief: makeBrief(), stale: false, generating: false };
    renderBlock();

    await user.click(await screen.findByRole("button", { name: "src/config.ts:12 — New limit constant" }));
    expect(onOpenFile).toHaveBeenLastCalledWith("src/config.ts", 12);

    await user.click(screen.getByRole("button", { name: "src/middleware/ratelimit.ts:12-18" }));
    expect(onOpenFile).toHaveBeenLastCalledWith("src/middleware/ratelimit.ts", 12);
    expect(onOpenFile).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: "package.json:34" })); // blast-only, not in the diff
    expect(await screen.findByText("File not in this PR's diff")).toBeInTheDocument();
    expect(onOpenFile).toHaveBeenCalledTimes(2);
  });

  // Catches: AC-17 (refresh = exactly one POST, summary replaced), AC-23 (disabled "Generating…"
  // control + dimmed/aria-busy content while running).
  it("refresh posts once, disables itself while generating (content aria-busy) and swaps in the new summary", async () => {
    let finish!: () => void;
    fake.state = { brief: makeBrief({ summary: "Old summary" }), stale: false, generating: false };
    fake.post = () =>
      new Promise((res) => {
        finish = () => {
          const next = makeBrief({ summary: "New summary" });
          fake.state = { brief: next, stale: false, generating: false };
          res([200, { brief: next }]);
        };
      });
    renderBlock();

    await user.click(await screen.findByRole("button", { name: "Regenerate brief" }));
    const busy = await screen.findByRole("button", { name: "Generating…" });
    expect(busy).toBeDisabled();
    expect(screen.getByText("Old summary").closest("[aria-busy='true']")).not.toBeNull();
    expect(fake.posts).toBe(1);

    finish();
    expect(await screen.findByText("New summary")).toBeInTheDocument();
    expect(screen.queryByText("Old summary")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Regenerate brief" })).toBeEnabled();
    expect(fake.posts).toBe(1);
  });

  // Catches: AC-23 - a generation started elsewhere (server flag, reload, second tab) shows as
  // running here; and a 409 from POST must be silent (no toast, no inline error).
  it("a server-side generating flag disables refresh; a 409 raises no toast or error", async () => {
    fake.state = { brief: makeBrief(), stale: false, generating: true };
    const first = renderBlock();
    expect(await screen.findByRole("button", { name: "Generating…" })).toBeDisabled();
    expect(screen.getByText(SUMMARY).closest("[aria-busy='true']")).not.toBeNull();
    first.unmount();

    fake.state = { brief: makeBrief(), stale: false, generating: false };
    fake.post = () => {
      fake.state = { ...fake.state, generating: true }; // the other run owns the flag now
      return fail(409, "generation_in_progress");
    };
    renderBlock();
    await user.click(await screen.findByRole("button", { name: "Regenerate brief" }));
    await waitFor(() => expect(fake.posts).toBe(1));
    expect(await screen.findByRole("button", { name: "Generating…" })).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Couldn't generate the brief")).not.toBeInTheDocument();
    expect(screen.getByText(SUMMARY)).toBeInTheDocument();
  });

  // Catches: AC-24 - missing key must give a clickable Settings link (not only a toast), a generic
  // failure without a brief must offer Retry, and with a brief it must toast and keep the brief.
  it("generation failures: missing key (inline link), generic without brief (Retry), generic with brief (toast, brief kept)", async () => {
    // a) missing key, no brief
    fake.post = () => fail(500, "missing_api_key");
    const a = renderBlock();
    await user.click(await screen.findByRole("button", { name: "Generate brief" }));
    const link = await screen.findByRole("link", { name: "Settings → API Keys" });
    expect(link).toHaveAttribute("href", "/settings/api-keys");
    expect(screen.getByRole("alert")).toHaveTextContent("No API key is configured");
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeInTheDocument();
    a.unmount();

    // b) generic, no brief → inline error + Retry (second POST)
    fake.posts = 0;
    fake.post = () => fail(502, "provider_error");
    const b = renderBlock();
    await user.click(await screen.findByRole("button", { name: "Generate brief" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't generate the brief");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(fake.posts).toBe(2));
    b.unmount();

    // c) generic, brief exists → toast, the brief stays, no inline alert
    fake.posts = 0;
    fake.state = { brief: makeBrief(), stale: false, generating: false };
    renderBlock();
    await user.click(await screen.findByRole("button", { name: "Regenerate brief" }));
    expect(await screen.findByText("Couldn't generate the brief")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(SUMMARY)).toBeInTheDocument();
  });

  // Catches: AC-24 variant - missing key with a brief must show the link inline too (a toast cannot hold it).
  it("missing key while a brief exists keeps the brief, shows the inline link and toasts", async () => {
    fake.state = { brief: makeBrief(), stale: false, generating: false };
    fake.post = () => fail(500, "missing_api_key");
    renderBlock();
    await user.click(await screen.findByRole("button", { name: "Regenerate brief" }));
    expect(await screen.findByRole("link", { name: "Settings → API Keys" })).toHaveAttribute("href", "/settings/api-keys");
    expect(screen.getByText(SUMMARY)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No API key is configured");
  });

  // Catches: a failed GET leaving the section blank / unretryable.
  it("a failed load shows an inline error with Retry that refetches", async () => {
    fake.getStatus = 500;
    renderBlock();
    expect(await screen.findByText("Couldn't load the brief")).toBeInTheDocument();
    fake.getStatus = 200;
    fake.state = { brief: makeBrief(), stale: false, generating: false };
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(SUMMARY)).toBeInTheDocument();
  });

  // Catches: AC-33 - long paths must keep a full accessible name and a `title` (the visual ellipsis
  // is CSS, which jsdom cannot assert).
  it("a 200+ char path keeps its full accessible name and title", async () => {
    fake.state = { brief: makeBrief(), stale: false, generating: false };
    renderBlock();
    const label = `${LONG_PATH}:3 — Long path`;
    expect(LONG_PATH.length).toBeGreaterThan(200);
    const row = await screen.findByRole("button", { name: label });
    expect(row).toHaveAttribute("title", label);
    const ref = screen.getByRole("button", { name: "src/middleware/ratelimit.ts:12-18" });
    expect(ref).toHaveAttribute("title", "src/middleware/ratelimit.ts:12-18");
  });

  // Catches: NFR security - model text rendered as HTML/markdown (script injection, javascript: links).
  it("renders <script> and markdown javascript: links in the summary as literal text", async () => {
    const evil = "<script>alert(1)</script> [x](javascript:alert(1))";
    fake.state = { brief: makeBrief({ summary: evil }), stale: false, generating: false };
    renderBlock();
    expect(await screen.findByText(evil)).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  // Catches: AC-41 - any hard-coded English UI label. Every label comes from `brief`/`prReview`,
  // so with all values prefixed "X:" every non-data text node, aria-label and title must carry it.
  it("every UI label comes from messages (all values prefixed 'X:')", async () => {
    const prefixed = (o: unknown): unknown =>
      typeof o === "string" ? `X:${o}` : Object.fromEntries(Object.entries(o as object).map(([k, v]) => [k, prefixed(v)]));
    const messages = { brief: prefixed(brief), prReview: prefixed(prReview) } as unknown as Record<string, string>;

    const data = [SUMMARY, "Auth surface touched", "Odd one", "The limiter runs before auth.", "src/", "New limit constant",
      "Core limiter", "Handler wiring", "Long path", "deep/", "Rate limit public webhooks", "Limiter middleware", "Dashboard",
      "Security Reviewer", "Chip risk from intent", "package.json", "src/middleware/ratelimit.ts"];
    const looksLikeData = (text: string) =>
      /^[\p{P}\p{S}\d\s]*$/u.test(text) ||
      /^(\$[\d.]+|[\d.]+K→[\d.]+K|3h)$/.test(text) ||
      data.some((d) => text.includes(d) || (text.length > 6 && d.includes(text)));
    const offenders = (root: HTMLElement) => {
      const bad: string[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = (n.textContent ?? "").trim();
        if (text && !text.startsWith("X:") && !looksLikeData(text)) bad.push(text);
      }
      for (const el of root.querySelectorAll("[aria-label],[title]")) {
        for (const attr of ["aria-label", "title"]) {
          const v = el.getAttribute(attr);
          if (v && !v.startsWith("X:") && !looksLikeData(v)) bad.push(`${attr}=${v}`);
        }
      }
      return bad;
    };
    const view = (
      <NextIntlClientProvider locale="en" messages={messages}>
        <ToastProvider>
          <QueryClientProvider client={client()}>{block()}</QueryClientProvider>
        </ToastProvider>
      </NextIntlClientProvider>
    );

    // Full brief: banner, ⓘ, notices (stale/truncated/missing), risks expanded, focus.
    h.reviews = [makeReview()];
    fake.state = {
      brief: makeBrief({ intent: null, blast: null, truncated: true }),
      stale: true,
      generating: false,
    };
    const first = render(view);
    await screen.findByText(SUMMARY);
    await user.click(screen.getByRole("button", { name: /^X:Show details: Auth surface touched$/ }));
    fireEvent.focus(screen.getByRole("button", { name: /^X:Security Reviewer/ }));
    expect(offenders(first.container)).toEqual([]);
    first.unmount();

    // Empty state.
    h.reviews = [];
    fake.state = { brief: null, stale: false, generating: false };
    const second = render(view);
    await screen.findByText("X:No brief yet");
    expect(offenders(second.container)).toEqual([]);
  });
});
