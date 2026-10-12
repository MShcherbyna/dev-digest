import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DocMarkdown } from "./DocMarkdown";

afterEach(cleanup);

describe("DocMarkdown (untrusted repo content)", () => {
  it("renders markdown structure but no raw HTML, no script, and no unsafe link targets", () => {
    // Catches: stored XSS / javascript: links from a hostile repo doc (NFR security - rendering).
    const { container } = render(
      <DocMarkdown>
        {[
          "# Title",
          "",
          "<script>window.__pwned = 1</script>",
          "",
          '<img src="https://evil.example/x.png" onerror="alert(1)">',
          "",
          "[bad](javascript:alert(1))",
          "[data](data:text/html;base64,AAAA)",
          "[mail](mailto:a@b.c)",
          "[rel](../other.md)",
          "[good](https://example.com/page)",
          "",
          "- one",
          "- two",
        ].join("\n")}
      </DocMarkdown>,
    );

    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(container.querySelector("script")).toBeNull();
    // Raw HTML is shown as inert text, never parsed into elements.
    expect(container.querySelector("img, [onerror]")).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();

    // Only the absolute https link is a real link.
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "https://example.com/page");
    expect(links[0]).toHaveAttribute("rel", expect.stringContaining("noopener"));
    for (const text of ["bad", "data", "mail", "rel"]) {
      expect(screen.getByText(text).closest("a")).toBeNull();
    }
  });

  it("renders an image as its alt text only, so previewing never triggers a remote fetch", () => {
    // Catches: the browser fetching remote URLs just because a doc was previewed (Q7).
    const { container } = render(<DocMarkdown>{"![architecture diagram](https://evil.example/pixel.png)"}</DocMarkdown>);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("architecture diagram")).toBeInTheDocument();
  });
});
