import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/lib/toast";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: [{ id: "a1", name: "Security", model: "gpt-4.1", enabled: true }] }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  useRunReview: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/hooks/multi-agent", () => ({
  useAgentEstimates: () => ({}),
  useLastAgentSelection: () => ({ data: { agent_ids: null } }),
  useLatestPrMultiAgentRun: () => ({ data: null }),
  useStartMultiAgentRun: () => ({ mutateAsync: vi.fn() }),
}));

import { RunReviewDropdown } from "./RunReviewDropdown";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <ToastProvider>{ui}</ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("RunReviewDropdown (smoke)", () => {
  it("renders the trigger label", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    expect(screen.getByText("Run Review")).toBeInTheDocument();
  });
});
