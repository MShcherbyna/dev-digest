import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import type { Convention } from "@/lib/hooks/conventions";
import { ConventionCard } from "./ConventionCard";

const BASE: Convention = {
  id: "c1",
  rule: "Always use TypeORM entity decorators",
  evidence_path: "lib/database/entities/Order.ts",
  evidence_snippet: '@Entity("orders")\n@Index(["order_number"])',
  evidence_line: 12,
  confidence: 0.9,
  accepted: false,
};

function setup(over: Partial<Convention> = {}) {
  const h = { onAccept: vi.fn(), onReject: vi.fn(), onSaveRule: vi.fn() };
  renderWithIntl(
    <ConventionCard convention={{ ...BASE, ...over }} repoFullName="acme/shop" headSha="abc123" {...h} />,
  );
  return h;
}

afterEach(cleanup);

describe("ConventionCard", () => {
  it("shows rule, evidence and confidence; GitHub link points at the exact line", () => {
    setup();
    expect(screen.getByText("Always use TypeORM entity decorators")).toBeInTheDocument();
    expect(screen.getByText("lib/database/entities/Order.ts")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /GitHub/ })).toHaveAttribute(
      "href",
      "https://github.com/acme/shop/blob/abc123/lib/database/entities/Order.ts#L12",
    );
  });

  it("Accept and Reject fire their callbacks", async () => {
    const h = setup();
    await userEvent.click(screen.getByRole("button", { name: /Accept/ }));
    await userEvent.click(screen.getByRole("button", { name: /Reject/ }));
    expect(h.onAccept).toHaveBeenCalledTimes(1);
    expect(h.onReject).toHaveBeenCalledTimes(1);
  });

  it("an accepted card shows the Accepted state instead of the Accept button", () => {
    setup({ accepted: true });
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Accept$/ })).not.toBeInTheDocument();
  });

  it("clicking the rule edits it inline and Save sends the new text", async () => {
    const h = setup();
    await userEvent.click(screen.getByText("Always use TypeORM entity decorators"));
    const field = screen.getByDisplayValue("Always use TypeORM entity decorators");
    await userEvent.clear(field);
    await userEvent.type(field, "Use entity decorators");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(h.onSaveRule).toHaveBeenCalledWith("Use entity decorators");
  });
});
