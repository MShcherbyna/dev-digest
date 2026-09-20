import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@/test/user";
import { renderWithIntl } from "@/test/render-intl";
import { AddSkillMenu } from "./AddSkillMenu";

afterEach(cleanup);

describe("AddSkillMenu", () => {
  it("offers Create new and Import .md", async () => {
    const onCreate = vi.fn();
    const onImport = vi.fn();
    renderWithIntl(<AddSkillMenu onCreate={onCreate} onImport={onImport} />);
    await userEvent.click(screen.getByRole("button", { name: /add skill/i }));
    await userEvent.click(screen.getByRole("button", { name: /create new/i }));
    expect(onCreate).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: /add skill/i }));
    await userEvent.click(screen.getByRole("button", { name: /import \.md/i }));
    expect(onImport).toHaveBeenCalledTimes(1);
  });
});
