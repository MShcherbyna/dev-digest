import { DIFF_MAX_CHARS } from "./constants";
import { parseExpected } from "./expected-output";

export interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  /** New-side line number of the first added line (null when none). */
  firstAddedLine: number | null;
}

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const stripPrefix = (p: string) => p.replace(/^[ab]\//, "").replace(/\t.*$/, "");

/** Files of a unified diff with +/- counts. Headers are recognised by shape (`diff --git`, a `---`/`+++`
    pair), not by hunk line counts, so a hand-pasted diff with sloppy hunk headers still parses. */
export function parseDiffFiles(raw: string): DiffFile[] {
  const files: DiffFile[] = [];
  let cur: (DiffFile & { hunks: number }) | null = null;
  let inHunk = false;
  let newLine = 0;
  const lines = raw.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.startsWith("diff --git ")) {
      const m = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
      cur = { path: m?.[2] ?? "", additions: 0, deletions: 0, firstAddedLine: null, hunks: 0 };
      files.push(cur);
      inHunk = false;
    } else if (line.startsWith("--- ") && (lines[i + 1] ?? "").startsWith("+++ ")) {
      const oldPath = stripPrefix(line.slice(4));
      const next = (lines[i + 1] ?? "").slice(4);
      const p = next === "/dev/null" ? oldPath : stripPrefix(next);
      if (cur && cur.hunks === 0) cur.path = p;
      else {
        cur = { path: p, additions: 0, deletions: 0, firstAddedLine: null, hunks: 0 };
        files.push(cur);
      }
      inHunk = false;
      i++;
    } else if (HUNK.test(line) && cur) {
      cur.hunks++;
      inHunk = true;
      newLine = Number(HUNK.exec(line)?.[1]);
    } else if (inHunk && cur) {
      const c = line[0];
      if (c === "+") {
        cur.additions++;
        cur.firstAddedLine ??= newLine;
        newLine++;
      } else if (c === "-") {
        cur.deletions++;
      } else if (c !== "\\") {
        newLine++;
      }
    }
  }
  return files.filter((f) => f.path);
}

export type Reason = { key: string; values?: Record<string, string> };
export interface FormReasons {
  name?: Reason;
  diff?: Reason;
  expected?: Reason;
}

/** Per-field reasons the form can't be saved/run (empty object = valid). */
export function validateCaseForm(form: { name: string; diff: string; expected: string }): FormReasons {
  const out: FormReasons = {};
  if (!form.name.trim()) out.name = { key: "nameRequired" };
  if (form.diff.length > DIFF_MAX_CHARS) out.diff = { key: "diffTooLarge" };
  else if (parseDiffFiles(form.diff).length === 0) out.diff = { key: "noFileInDiff" };
  const exp = parseExpected(form.expected);
  if (!exp.ok) out.expected = exp.reason === "json" ? { key: "invalidJsonReason" } : { key: "contractError", values: { detail: exp.detail } };
  return out;
}

/** Inserts a finding skeleton (pre-filled from the first diff file) into the JSON array text. */
export function addSkeleton(text: string, diff: string): string {
  let arr: unknown[] = [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) arr = parsed;
  } catch {
    /* start from an empty array */
  }
  const first = parseDiffFiles(diff)[0];
  arr.push({
    severity: "WARNING",
    category: "bug",
    title: "",
    file: first?.path ?? "",
    start_line: first?.firstAddedLine ?? 1,
  });
  return JSON.stringify(arr, null, 2);
}

export const formatDuration = (ms: number | null) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`);
export const formatCost = (usd: number | null) => (usd == null ? "—" : `$${usd.toFixed(2)}`);

export interface ServerReason extends Reason {
  field: "diff" | "expected" | "general";
}

/** Maps a coded API error (422/409/network) of save/run onto the field it concerns. */
export function serverReason(e: unknown): ServerReason {
  const code = (e as { code?: string } | null)?.code;
  const details = (e as { details?: { index?: number } } | null)?.details;
  switch (code) {
    case "diff_too_large":
      return { field: "diff", key: "diffTooLarge" };
    case "diff_unparsable":
      return { field: "diff", key: "diffUnparsable" };
    case "expectation_outside_diff":
      return { field: "expected", key: "expectationOutsideDiff", values: { index: String((details?.index ?? 0) + 1) } };
    default:
      return { field: "general", key: "saveFailed" };
  }
}
