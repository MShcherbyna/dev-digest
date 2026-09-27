import type { SmartDiff, SmartDiffFile, SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from './classify.js';
import { ROLE_ORDER } from './constants.js';

export interface SmartDiffInputFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface SmartDiffAnchor {
  file: string;
  startLine: number;
}

/**
 * Builds the Smart Diff read model: classifies every file into a role, groups
 * them in `ROLE_ORDER` (omitting empty roles), and attaches the sorted unique
 * finding lines for each file from `anchors`. Pure — no HTTP/DB dependency.
 */
export function buildSmartDiff(files: SmartDiffInputFile[], anchors: SmartDiffAnchor[]): SmartDiff {
  const linesByPath = new Map<string, Set<number>>();
  for (const anchor of anchors) {
    const set = linesByPath.get(anchor.file);
    if (set) {
      set.add(anchor.startLine);
    } else {
      linesByPath.set(anchor.file, new Set([anchor.startLine]));
    }
  }

  const byRole = new Map<SmartDiffRole, SmartDiffFile[]>();
  let totalLines = 0;

  for (const file of files) {
    totalLines += file.additions + file.deletions;
    const role = classifyFile(file.path);
    const findingLines = [...(linesByPath.get(file.path) ?? [])].sort((a, b) => a - b);
    const smartDiffFile: SmartDiffFile = {
      path: file.path,
      pseudocode_summary: null,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: findingLines,
    };
    const bucket = byRole.get(role);
    if (bucket) {
      bucket.push(smartDiffFile);
    } else {
      byRole.set(role, [smartDiffFile]);
    }
  }

  const groups = ROLE_ORDER.filter((role) => (byRole.get(role)?.length ?? 0) > 0).map((role) => ({
    role,
    files: byRole.get(role)!,
  }));

  return {
    groups,
    split_suggestion: {
      too_big: false,
      total_lines: totalLines,
      proposed_splits: [],
    },
  };
}
