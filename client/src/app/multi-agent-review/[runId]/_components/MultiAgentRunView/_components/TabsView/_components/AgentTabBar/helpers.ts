/** Same score->color thresholds as the vendored `CircularScore` ring, so a
 * tab's score number reads consistently with the Columns view. */
export function scoreColor(score: number): string {
  return score >= 75 ? "var(--ok)" : score >= 50 ? "var(--warn)" : "var(--crit)";
}
