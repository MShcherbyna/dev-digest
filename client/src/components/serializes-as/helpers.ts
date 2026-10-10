/** Heading of the "SERIALIZES AS" box, as drawn in the design (differs from the real `## Project context` prompt heading). */
export const SERIALIZES_HEADING = "## Project specifications";

/** Text shown in the "SERIALIZES AS" box: the heading plus one `- <path>` line per attached path. */
export function serializeAttachments(paths: string[]): string {
  return [SERIALIZES_HEADING, ...paths.map((p) => `- ${p}`)].join("\n");
}
