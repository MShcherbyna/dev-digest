import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import user from "@/test/user";
import blast from "../../../../../../../../../../messages/en/blast.json";
import { ResyncButton } from "./ResyncButton";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderButton(resyncStatus: number) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).endsWith("/resync") && init?.method === "POST") {
      return new Response("{}", { status: resyncStatus });
    }
    // Index state never advances, so a started resync stays pending.
    return new Response(JSON.stringify({ status: "full", updatedAt: "2026-01-01T00:00:00Z", lastIndexedSha: "a" }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <NextIntlClientProvider locale="en" messages={{ blast }}>
        <ResyncButton repoId="repo-1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return fetchMock;
}

describe("ResyncButton", () => {
  it("POSTs the resync and stays disabled as 'Resyncing…' until the index advances", async () => {
    const fetchMock = renderButton(202);
    // Let the index-state query load so the resync can remember the current updatedAt.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Resync index" }));
    const busy = await screen.findByRole("button", { name: "Resyncing…" });
    expect(busy).toBeDisabled();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(String(post?.[0])).toContain("/repos/repo-1/resync");
  });

  it("shows an alert and re-enables the button when the resync cannot start", async () => {
    const fetchMock = renderButton(500);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Resync index" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't start a resync.");
    expect(screen.getByRole("button", { name: "Resync index" })).toBeEnabled();
  });
});
