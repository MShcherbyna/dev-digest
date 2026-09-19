import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-intl";
import { SkillBodyEditor } from "./SkillBodyEditor";
import { fileStem, lineNumbers } from "./helpers";

afterEach(cleanup);

describe("SkillBodyEditor", () => {
  it("shows the file chip, live token estimate and no unsaved marker when unchanged", () => {
    renderWithIntl(<SkillBodyEditor value={"12345678"} savedValue={"12345678"} name="My Skill" onChange={() => {}} />);
    expect(screen.getByText("my-skill.md")).toBeInTheDocument();
    expect(screen.getByText("~2 tokens")).toBeInTheDocument();
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
  });

  it("marks unsaved edits, rounds tokens up and numbers the lines", () => {
    renderWithIntl(<SkillBodyEditor value={"a\nb\nc\n123456789"} savedValue="a" name="x" onChange={() => {}} />);
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    expect(screen.getByText("~4 tokens")).toBeInTheDocument(); // ceil(15 / 4)
    expect(screen.getByText("4")).toBeInTheDocument(); // last line number
  });
});

describe("helpers", () => {
  it("lineNumbers / fileStem", () => {
    expect(lineNumbers("")).toEqual([1]);
    expect(lineNumbers("a\nb")).toEqual([1, 2]);
    expect(fileStem("  ")).toBe("skill");
    expect(fileStem("Edge Case")).toBe("edge-case");
  });
});
