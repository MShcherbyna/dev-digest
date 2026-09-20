/** 1-based line numbers for a text (an empty text still has line 1). */
export function lineNumbers(text: string): number[] {
  const count = text.split("\n").length;
  return Array.from({ length: count }, (_, i) => i + 1);
}

/** Skill name -> file stem shown in the `<name>.md` chip. */
export function fileStem(name: string): string {
  const stem = name.trim().replace(/\s+/g, "-").toLowerCase();
  return stem || "skill";
}
