import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en/common.json";
import RouteError from "./error";
import NotFound from "./not-found";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(cleanup);

const withIntl = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ common: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("app-level boundaries", () => {
  it("error boundary shows a message and Retry calls reset", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reset = vi.fn();
    withIntl(<RouteError error={new Error("boom")} reset={reset} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("not-found page offers a way back home", () => {
    withIntl(<NotFound />);
    expect(screen.getByText("Page not found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to DevDigest" })).toBeInTheDocument();
  });
});
