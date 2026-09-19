import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";

const previewAsync = vi.fn();
const createMutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useImportSkillPreview: () => ({ mutateAsync: previewAsync, isPending: false }),
  useCreateSkill: () => ({ mutate: createMutate, isPending: false }),
}));

import { ImportSkillModal } from "./ImportSkillModal";
import { isMarkdownFile } from "./helpers";

const PREVIEW = {
  name: "flaky-test-detector",
  description: "Warn about time-dependent tests",
  type: "custom",
  body: "# Flaky\nAvoid sleeps.",
  tokens: 6,
  warnings: ["Contains a URL"],
};

function mdFile(name = "flaky.md", text = "# Flaky\nAvoid sleeps.") {
  const file = new File([text], name, { type: "text/markdown" });
  // jsdom's File may lack .text(); provide it so the component can read the content.
  if (typeof file.text !== "function") Object.defineProperty(file, "text", { value: async () => text });
  return file;
}

beforeEach(() => {
  previewAsync.mockReset();
  createMutate.mockReset();
});
afterEach(cleanup);

describe("ImportSkillModal", () => {
  it("reads the file text, previews it with warnings and saves as imported_url only on confirm", async () => {
    previewAsync.mockResolvedValue(PREVIEW);
    createMutate.mockImplementation((_i, opts) => opts?.onSuccess?.({ id: "sk9" }));
    const onImported = vi.fn();
    renderWithIntl(<ImportSkillModal onClose={() => {}} onImported={onImported} />);

    expect(screen.getByRole("button", { name: "Confirm & save" })).toBeDisabled();
    await userEvent.upload(screen.getByTestId("skill-file-input"), mdFile());

    await waitFor(() => expect(screen.getByDisplayValue("flaky-test-detector")).toBeInTheDocument());
    expect(previewAsync).toHaveBeenCalledWith({ filename: "flaky.md", content: "# Flaky\nAvoid sleeps." });
    expect(createMutate).not.toHaveBeenCalled(); // nothing saved before confirm
    expect(screen.getByText(/foreign instructions inside your agent's prompt/i)).toBeInTheDocument();
    expect(screen.getByText("Contains a URL")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Confirm & save" }));
    expect(createMutate).toHaveBeenCalledWith(
      {
        name: "flaky-test-detector",
        description: "Warn about time-dependent tests",
        type: "custom",
        body: "# Flaky\nAvoid sleeps.",
        source: "imported_url",
      },
      expect.anything(),
    );
    expect(onImported).toHaveBeenCalledWith("sk9");
  });

  it("lets the user edit the preview before saving", async () => {
    previewAsync.mockResolvedValue(PREVIEW);
    renderWithIntl(<ImportSkillModal onClose={() => {}} onImported={() => {}} />);
    await userEvent.upload(screen.getByTestId("skill-file-input"), mdFile());
    const name = await screen.findByDisplayValue("flaky-test-detector");
    await userEvent.clear(name);
    await userEvent.type(name, "renamed");
    await userEvent.click(screen.getByRole("button", { name: "Confirm & save" }));
    expect(createMutate).toHaveBeenCalledWith(expect.objectContaining({ name: "renamed" }), expect.anything());
  });

  it("shows an inline error when the preview fails and keeps Confirm disabled", async () => {
    previewAsync.mockRejectedValue(new Error("boom"));
    renderWithIntl(<ImportSkillModal onClose={() => {}} onImported={() => {}} />);
    await userEvent.upload(screen.getByTestId("skill-file-input"), mdFile());
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not read that file.");
    expect(screen.getByRole("button", { name: "Confirm & save" })).toBeDisabled();
  });
});

describe("isMarkdownFile", () => {
  it("accepts only .md", () => {
    expect(isMarkdownFile("a.md")).toBe(true);
    expect(isMarkdownFile("A.MD")).toBe(true);
    expect(isMarkdownFile("a.zip")).toBe(false);
  });
});
