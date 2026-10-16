import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { ToastProvider, notify } from "./toast";

afterEach(cleanup);

describe("toast link", () => {
  it("renders an anchor inside the toast when a link is given, and no anchor otherwise", () => {
    // Catches: the optional { href, label } link (plan 1.15) not rendered, or rendered for plain toasts.
    render(<ToastProvider>{null}</ToastProvider>);
    act(() => notify.success("Eval case created", { href: "/agents/ag1?tab=evals", label: "View in Evals" }));
    const link = screen.getByRole("link", { name: "View in Evals" });
    expect(link).toHaveAttribute("href", "/agents/ag1?tab=evals");
    expect(screen.getByText("Eval case created")).toBeInTheDocument();

    act(() => notify.error("Plain failure"));
    expect(screen.getByText("Plain failure")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
