/**
 * Application-layer ports of the reviews module. Plain TS, no infrastructure imports.
 */

/** Read-only link from findings to the eval cases created from them (implemented by the eval module). */
export interface EvalCaseLinks {
  /** finding id -> eval case id, workspace-scoped, one lookup for all ids. */
  caseIdsForFindings(workspaceId: string, findingIds: string[]): Promise<Map<string, string>>;
}
