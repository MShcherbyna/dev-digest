import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { compareResponse } from "@/test/eval-fixtures";
import type { CompareResponse } from "@/lib/hooks/eval";
import { api, ApiError } from "@/lib/api";
import { CompareModal } from "./CompareModal";

vi.mock("@/lib/api", async (orig) => {
  const actual = await orig<typeof import("@/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() } };
});
const post = vi.mocked(api.post);

function renderModal(compare: CompareResponse, onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  renderWithIntl(
    <QueryClientProvider client={qc}>
      <CompareModal agentId="ag1" compare={compare} onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
}

const tile = (label: string) => screen.getByText(label).parentElement as HTMLElement;
const dialog = () => screen.getByRole("dialog");

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("CompareModal", () => {
  it("shows the metric tiles (null side = '—', no delta) and a line diff with removed/added prefixes", () => {
    // Catches: a null metric rendered as 0%/NaN or given a delta, wrong delta direction/points,
    // and the diff relying on colour only (no screen-reader prefix) or marking unchanged lines.
    renderModal(
      compareResponse({
        b: { ...compareResponse().b, citation_accuracy: null },
        deltas: { recall: 0.04, precision: -0.02, citation_accuracy: null, cost_usd: 0.02 },
      }),
    );
    expect(dialog()).toHaveAccessibleName("Compare runs · v2 → v3");
    expect(screen.getByText("Old prompt vs new — metric deltas and prompt diff on the 5-trace gold set")).toBeInTheDocument();

    expect(tile("RECALL")).toHaveTextContent("78%");
    expect(tile("RECALL")).toHaveTextContent("82%");
    expect(within(tile("RECALL")).getByText("up")).toBeInTheDocument();
    expect(tile("RECALL")).toHaveTextContent("4pt");
    expect(within(tile("PRECISION")).getByText("down")).toBeInTheDocument();
    expect(tile("PRECISION")).toHaveTextContent("2pt");
    expect(tile("CITATION")).toHaveTextContent("70%");
    expect(tile("CITATION")).toHaveTextContent("—");
    expect(tile("CITATION")).not.toHaveTextContent(/pt|NaN|▲|▼/);
    expect(tile("COST")).toHaveTextContent("0.10");
    expect(tile("COST")).toHaveTextContent("0.12");
    expect(tile("COST")).toHaveTextContent("0.02");

    const diff = screen.getByTestId("prompt-diff");
    const lines = Array.from(diff.children).map((l) => l.textContent);
    expect(lines).toEqual(["line one", "removed: old line", "added: new line", "line three"]);
  });

  it("says the prompts are identical instead of rendering a diff", () => {
    // Catches: an empty/all-unchanged diff block shown for identical prompts (P2-E-8).
    renderModal(compareResponse({ prompt_a: "same", prompt_b: "same" }));
    expect(screen.getByText("System prompts are identical")).toBeInTheDocument();
    expect(screen.queryByTestId("prompt-diff")).not.toBeInTheDocument();
  });

  it("offers one Promote button per candidate; with none, a disabled 'Promote vB' plus the reason", () => {
    // Catches: promoting the current config or a missing snapshot being offered, and the
    // 0-candidate state hiding the button / losing the explanation (P2-AC-16).
    const c = compareResponse();
    renderModal(c);
    expect(screen.getByRole("button", { name: "Promote v2" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Promote v3" })).toBeEnabled();
    cleanup();

    renderModal({ ...c, a: { ...c.a, is_current_config: true } });
    expect(screen.queryByRole("button", { name: "Promote v2" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Promote v3" })).toBeEnabled();
    cleanup();

    renderModal({ ...c, a: { ...c.a, version_available: false }, b: { ...c.b, is_current_config: true } });
    const disabled = screen.getByRole("button", { name: "Promote v3" });
    expect(disabled).toBeDisabled();
    expect(disabled).toHaveAccessibleDescription("v3 is already the current configuration");
    expect(screen.queryByRole("button", { name: "Promote v2" })).not.toBeInTheDocument();
  });

  it("confirms before promoting, toasts the new version and closes; an API error toasts and stays open", async () => {
    // Catches: promote sent without the confirm step, wrong version in the request/toast,
    // modal left open after success, and a 409/404 being shown as success or a raw error.
    post.mockResolvedValueOnce({ agent: {}, version: 4 });
    const onClose = renderModal(compareResponse());

    await userEvent.click(screen.getByRole("button", { name: "Promote v3" }));
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText("Promote v3?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Promote v3" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Promote v3" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm promote" }));
    expect(await screen.findByText("Promoted v3 as v4")).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith("/agents/ag1/promote", { version: 3 });
    expect(onClose).toHaveBeenCalledTimes(1);

    // onClose is a spy here, so the modal stays mounted on the confirm step; step back first.
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    post.mockRejectedValueOnce(new ApiError("identical", 409, "identical"));
    await userEvent.click(screen.getByRole("button", { name: "Promote v2" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm promote" }));
    expect(await screen.findByText("That version is already the current configuration")).toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1); // not closed on error
    expect(screen.getByRole("button", { name: "Promote v2" })).toBeInTheDocument(); // back from confirm step
  });

  it("closes on Escape and returns focus to the Compare button that opened it", async () => {
    // Catches: focus lost to <body> after the modal closes (keyboard users, a11y NFR).
    const qc = new QueryClient();
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <QueryClientProvider client={qc}>
          <button onClick={() => setOpen(true)}>Compare</button>
          {open && <CompareModal agentId="ag1" compare={compareResponse()} onClose={() => setOpen(false)} />}
        </QueryClientProvider>
      );
    }
    renderWithIntl(<Harness />);
    const opener = screen.getByRole("button", { name: "Compare" });
    opener.focus();
    await userEvent.click(opener);
    expect(dialog().contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
