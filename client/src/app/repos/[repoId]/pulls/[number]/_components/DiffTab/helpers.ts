/** Pure helpers for the DiffTab (no React). */
import type { FindingRecord, PrFile, ReviewRecord, SmartDiffResponse, SmartDiffRole } from "@devdigest/shared";

export interface ViewGroup {
  role: SmartDiffRole;
  files: PrFile[];
  findingFiles: number;
}

/**
 * The PR's latest `kind:"review"` review. `reviews` is already newest-first
 * (server/src/modules/reviews/repository/review.repo.ts `reviewsForPull`),
 * which mirrors the server's own "latest review" rule in
 * `latestReviewFindingAnchors` — same review, two data sources.
 */
export function latestReview(reviews: ReviewRecord[] | undefined): ReviewRecord | undefined {
  return reviews?.find((r) => r.kind === "review");
}

export function findingsByPath(findings: FindingRecord[]): Map<string, FindingRecord[]> {
  const map = new Map<string, FindingRecord[]>();
  for (const f of findings) {
    const list = map.get(f.file) ?? [];
    list.push(f);
    map.set(f.file, list);
  }
  return map;
}

export function linesByPath(sd: SmartDiffResponse): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const group of sd.groups) {
    for (const file of group.files) {
      map.set(file.path, file.finding_lines);
    }
  }
  return map;
}

/**
 * Buckets `files` (kept in their GitHub order) by the role the server
 * assigned them in `sd`. A file missing from the response (e.g. `pr_files`
 * rewritten between the two fetches) goes to `core` so it's never hidden.
 * Groups are emitted in `sd.groups` order (with a leftover `core` bucket
 * inserted first if one didn't already exist); empty groups are dropped.
 */
export function buildViewGroups(files: PrFile[], sd: SmartDiffResponse): ViewGroup[] {
  const roleByPath = new Map<string, SmartDiffRole>();
  const findingLineCountByPath = new Map<string, number>();
  for (const group of sd.groups) {
    for (const file of group.files) {
      roleByPath.set(file.path, group.role);
      findingLineCountByPath.set(file.path, file.finding_lines.length);
    }
  }

  const filesByRole = new Map<SmartDiffRole, PrFile[]>();
  for (const file of files) {
    const role = roleByPath.get(file.path) ?? "core";
    const list = filesByRole.get(role) ?? [];
    list.push(file);
    filesByRole.set(role, list);
  }

  const roleOrder: SmartDiffRole[] = sd.groups.map((g) => g.role);
  if (filesByRole.has("core") && !roleOrder.includes("core")) roleOrder.unshift("core");

  return roleOrder
    .map((role) => {
      const groupFiles = filesByRole.get(role) ?? [];
      const findingFiles = groupFiles.filter(
        (f) => (findingLineCountByPath.get(f.path) ?? 0) > 0,
      ).length;
      return { role, files: groupFiles, findingFiles };
    })
    .filter((g) => g.files.length > 0);
}
