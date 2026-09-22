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
import { zipSync, strToU8 } from "fflate";

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

  it("accepts a .zip, sends the SKILL.md text to preview and shows it", async () => {
    previewAsync.mockResolvedValue(PREVIEW);
    renderWithIntl(<ImportSkillModal onClose={() => {}} onImported={() => {}} />);
    const bytes = zipSync({ "pkg/SKILL.md": strToU8("# Flaky\nAvoid sleeps.") });
    const file = new File([bytes], "skill.zip", { type: "application/zip" });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    });
    await userEvent.upload(screen.getByTestId("skill-file-input"), file);

    await waitFor(() => expect(screen.getByDisplayValue("flaky-test-detector")).toBeInTheDocument());
    expect(previewAsync).toHaveBeenCalledWith({ filename: "SKILL.md", content: "# Flaky\nAvoid sleeps." });
  });

  it("shows an inline error for an archive without a skill", async () => {
    renderWithIntl(<ImportSkillModal onClose={() => {}} onImported={() => {}} />);
    const bytes = zipSync({ "a.txt": strToU8("x") });
    const file = new File([bytes], "bad.zip", { type: "application/zip" });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    });
    await userEvent.upload(screen.getByTestId("skill-file-input"), file);
    expect(await screen.findByRole("alert")).toHaveTextContent(/No SKILL\.md/);
    expect(previewAsync).not.toHaveBeenCalled();
  });

  it("drops the previous preview when the next file fails", async () => {
    previewAsync.mockResolvedValue(PREVIEW);
    renderWithIntl(<ImportSkillModal onClose={() => {}} onImported={() => {}} />);
    await userEvent.upload(screen.getByTestId("skill-file-input"), mdFile());
    await waitFor(() => expect(screen.getByDisplayValue("flaky-test-detector")).toBeInTheDocument());

    const bytes = zipSync({ "a.txt": strToU8("x") });
    const bad = new File([bytes], "bad.zip", { type: "application/zip" });
    Object.defineProperty(bad, "arrayBuffer", {
      value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    });
    await userEvent.upload(screen.getByTestId("skill-file-input"), bad);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("flaky-test-detector")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm & save" })).toBeDisabled();
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
