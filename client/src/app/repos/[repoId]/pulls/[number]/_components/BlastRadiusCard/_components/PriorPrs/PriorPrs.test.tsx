import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import user from "@/test/user";
import { githubPrUrl } from "@/lib/github-urls";
import type { PriorPrsResponse } from "@/lib/hooks/blast";
import blast from "../../../../../../../../../../messages/en/blast.json";
import { PriorPrs } from "./PriorPrs";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const item = (n: number, over: Partial<PriorPrsResponse["history"][number]> = {}) => ({
  pr_number: n,
  title: `Title ${n}`,
  merged_at: "2026-03-18T10:00:00Z",
  author: "deepak.r",
  files_overlap: [],
  notes: `Note ${n}`,
  ...over,
});

function renderBlock(response: PriorPrsResponse | "error") {
  const fetchMock = vi.fn(async () =>
    response === "error"
      ? new Response("{}", { status: 500 })
      : new Response(JSON.stringify(response), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ blast }}>
        <PriorPrs prId="pr-1" repoFullName="acme/api" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return fetchMock;
}

describe("PriorPrs", () => {
  it("is collapsed by default, expands to the timeline, and renders untrusted text literally", async () => {
    renderBlock({
      available: true,
      history: [item(401), item(356, { title: "<img src=x onerror=alert(1)>", notes: "" })],
    });
    const head = await screen.findByRole("button", { name: /Prior PRs touching these files/ });
    expect(head).toHaveAttribute("aria-expanded", "false");
    expect(head).toHaveTextContent("2");
    expect(screen.queryByText("Title 401")).not.toBeInTheDocument();

    await user.click(head);
    expect(head).toHaveAttribute("aria-expanded", "true");
    const link = screen.getByRole("link", { name: "#401" });
    expect(link).toHaveAttribute("href", githubPrUrl("acme/api", 401));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("Title 401")).toBeInTheDocument();
    expect(screen.getAllByText("deepak.r · 2026-03-18")).toHaveLength(2);
    expect(screen.getByText("Note 401")).toBeInTheDocument();
    expect(screen.queryByText("Note 356")).not.toBeInTheDocument();
    // Literal text, no element injected.
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it.each([
    ["unavailable", { available: false, history: [item(1)] } as PriorPrsResponse],
    ["empty", { available: true, history: [] } as PriorPrsResponse],
    ["a failed request", "error" as const],
  ])("renders nothing when %s", async (_name, response) => {
    const fetchMock = renderBlock(response);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
