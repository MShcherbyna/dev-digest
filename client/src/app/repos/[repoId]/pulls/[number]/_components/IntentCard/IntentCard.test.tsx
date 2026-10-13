import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-intl";
import type { PrIntent } from "@/lib/hooks/intent";

const h = vi.hoisted(() => ({ intent: null as unknown }));
vi.mock("@/lib/hooks/intent", () => ({
  usePrIntent: () => ({ data: { intent: h.intent }, isPending: false, isSuccess: true, isError: false, error: null }),
  useDeriveIntent: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useIsDerivingIntent: () => 0,
}));

import { IntentCard } from "./IntentCard";

const INTENT: PrIntent = {
  pr_id: "pr1",
  intent: "Rate limit public webhooks",
  in_scope: ["Limiter"],
  out_of_scope: [],
  risk_areas: ["Chip risk from intent"],
  confidence: "high",
  sources: [],
  head_sha: "sha1",
  derived_at: "2026-01-01T00:00:00Z",
  model: null,
  stale: false,
};

afterEach(cleanup);

describe("IntentCard risk areas slot", () => {
  // Catches: AC-13 regression - without the slot the card must keep today's chips exactly;
  // with it the brief's risk cards replace the chips under the same RISK AREAS heading.
  it("keeps the intent's own chips when no slot is given, and replaces them with the slot when given", () => {
    h.intent = INTENT;
    const { unmount } = renderWithIntl(<IntentCard prId="pr1" />);
    expect(screen.getByText("Chip risk from intent")).toBeInTheDocument();
    expect(screen.getByText("Risk areas")).toBeInTheDocument();
    unmount();

    renderWithIntl(<IntentCard prId="pr1" riskAreas={<div data-testid="slot">Risk card A</div>} />);
    expect(screen.queryByText("Chip risk from intent")).not.toBeInTheDocument();
    const slot = screen.getByTestId("slot");
    expect(slot).toHaveTextContent("Risk card A");
    // exactly one RISK AREAS heading, placed with the slot
    expect(screen.getAllByText("Risk areas")).toHaveLength(1);
    expect(within(slot.parentElement!).getByText("Risk areas")).toBeInTheDocument();
    // the rest of the intent is untouched
    expect(screen.getByText(/Rate limit public webhooks/)).toBeInTheDocument();
  });

  // Catches: the slot being dropped when no intent exists (Q5) - the brief's risks must still show.
  it("renders the slot even when the intent is null", () => {
    h.intent = null;
    renderWithIntl(<IntentCard prId="pr1" riskAreas={<div>Risk card B</div>} />);
    expect(screen.getByText("Risk card B")).toBeInTheDocument();
    expect(screen.getByText("Risk areas")).toBeInTheDocument();
  });
});
