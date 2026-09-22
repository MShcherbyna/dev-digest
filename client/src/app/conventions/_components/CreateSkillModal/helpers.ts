import type { Convention } from "@/lib/hooks/conventions";
import { BODY_TITLE } from "./constants";

/** Draft skill text for the accepted conventions (the user can edit it before saving). */
export function buildSkillBody(conventions: Convention[]): string {
  const items = conventions.map((c) => {
    const ref = c.evidence_path ? `${c.evidence_path}${c.evidence_line ? `#L${c.evidence_line}` : ""}` : "";
    return `- ${c.rule}${ref ? `\n  - evidence: \`${ref}\`` : ""}`;
  });
  return `${BODY_TITLE}\n\nFollow these conventions when writing or reviewing code in this repository.\n\n${items.join("\n")}\n`;
}
