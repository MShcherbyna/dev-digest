import { unzipSync } from "fflate";
import { MAX_SKILL_BYTES, SKILL_ENTRY_NAME } from "./constants";

/** True for `*.md` filenames (case-insensitive). */
export function isMarkdownFile(filename: string): boolean {
  return /\.md$/i.test(filename);
}

/** True for `*.zip` filenames (case-insensitive). */
export function isZipFile(filename: string): boolean {
  return /\.zip$/i.test(filename);
}

export type ArchiveErrorCode = "invalid" | "noSkill" | "tooLarge";

export class ArchiveError extends Error {
  constructor(readonly code: ArchiveErrorCode) {
    super(code);
  }
}

const baseName = (path: string) => path.split("/").pop() ?? path;

/** Skip directories, macOS resource forks and hidden files. */
const isCandidate = (path: string) =>
  isMarkdownFile(path) && !path.endsWith("/") && !path.startsWith("__MACOSX/") && !baseName(path).startsWith(".");

/** Pick `SKILL.md` (shallowest wins), else the only `.md` in the archive. */
export function pickSkillEntry(paths: string[]): string | null {
  const md = paths.filter(isCandidate);
  const skill = md
    .filter((p) => baseName(p).toLowerCase() === SKILL_ENTRY_NAME)
    .sort((a, b) => a.split("/").length - b.split("/").length);
  if (skill[0]) return skill[0];
  return md.length === 1 && md[0] ? md[0] : null;
}

/**
 * Read the skill's Markdown text out of a .zip. Only that single entry is
 * inflated (size-checked from the header first); nothing is executed.
 */
export function extractSkillFromZip(data: Uint8Array): { filename: string; content: string } {
  let entry: string | null;
  try {
    const names: string[] = [];
    unzipSync(data, {
      filter: (f) => {
        names.push(f.name);
        return false;
      },
    });
    entry = pickSkillEntry(names);
  } catch {
    throw new ArchiveError("invalid");
  }
  if (!entry) throw new ArchiveError("noSkill");

  try {
    const files = unzipSync(data, {
      filter: (f) => {
        if (f.name !== entry) return false;
        if (f.originalSize > MAX_SKILL_BYTES) throw new ArchiveError("tooLarge");
        return true;
      },
    });
    const bytes = files[entry];
    if (!bytes) throw new ArchiveError("noSkill");
    return { filename: baseName(entry), content: new TextDecoder().decode(bytes) };
  } catch (e) {
    throw e instanceof ArchiveError ? e : new ArchiveError("invalid");
  }
}
