import type { CompareResponse } from "@/lib/hooks/eval";

export type DiffLine = { type: "same" | "add" | "del"; text: string };

/** Line-level diff via LCS (plain text only). Prompts are a few hundred lines, so O(n*m) is fine. */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ type: "del", text: a[i++]! });
    } else {
      out.push({ type: "add", text: b[j++]! });
    }
  }
  while (i < a.length) out.push({ type: "del", text: a[i++]! });
  while (j < b.length) out.push({ type: "add", text: b[j++]! });
  return out;
}

export interface PromoteCandidate {
  version: number;
}

/** Sides that can be promoted: not already the current config and the version snapshot still exists. */
export function promoteCandidates(c: CompareResponse): PromoteCandidate[] {
  return [c.a, c.b]
    .filter((side) => !side.is_current_config && side.version_available)
    .map((side) => ({ version: side.agent_version }));
}
