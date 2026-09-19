/**
 * Built-in skills for the Test Quality Reviewer seed. All `source: 'manual'`
 * (trusted). The 4th skill, `flaky-test-detector`, is intentionally NOT seeded —
 * it is imported through the UI from `server/fixtures/skills/flaky-test-detector.md`.
 */
export interface SeedSkill {
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  body: string;
}

export const TEST_QUALITY_SKILLS: SeedSkill[] = [
  {
    name: 'uncovered-branches',
    description:
      'Use when a diff adds or changes conditional logic. Map every new branch, catch block and early return to a test that would fail if it broke; report branches with none.',
    type: 'rubric',
    body: `# Uncovered branches

Goal: every new or changed branch must be pinned by a test that FAILS if the branch
is removed or inverted.

## Procedure
1. List each changed conditional in the production diff: \`if/else\`, \`switch\` case,
   ternary, \`??\` / \`?.\` fallback, early \`return\`, \`catch\`, default parameter.
2. For each, find the added/changed test that drives execution down that branch.
3. Confirm the test asserts an observable outcome of that branch (return value,
   thrown error, persisted state) — merely executing the line is not coverage.
4. Report a branch with no such test.

## Report as findings
- Error / catch paths with no test asserting the failure behavior.
- The "else" or "not found" side of a new lookup or guard.
- New enum/union members or switch cases that no test reaches.
- Feature flags and option combinations only tested in one state.

## Do not report
- Trivial getters, pass-through wrappers, generated or type-only code.
- Branches clearly covered by tests outside the diff that you can see referenced.

## Severity
- CRITICAL: uncovered branch in an auth, money, data-deletion or validation path.
- WARNING: uncovered branch elsewhere in changed production code.
- SUGGESTION: uncovered defensive branch that cannot occur in practice.

Cite the production file:line of the uncovered branch.`,
  },
  {
    name: 'edge-case-checklist',
    description:
      'Use when reviewing tests for changed logic. Check each item of the corner-case list against the assertions and report the cases the code handles but the tests skip.',
    type: 'rubric',
    body: `# Edge-case checklist

Walk this list against the changed code and its tests. Flag only cases the code
plausibly encounters; skip items that cannot apply.

## Inputs
- Empty: \`''\`, \`[]\`, \`{}\`, \`null\`, \`undefined\`.
- Boundaries: 0, 1, N, N+1, max length, off-by-one at slice/loop bounds.
- Negative numbers, NaN, Infinity, floating-point rounding.
- Duplicates and ordering ties; already-sorted and reverse-sorted input.
- Unicode, emoji, very long strings, leading/trailing whitespace, mixed case.

## State and time
- First call vs repeated call (idempotency), concurrent calls, retry after failure.
- Time zones, DST, month/year rollovers, leap days, expired vs not-yet-valid.

## Failure
- Dependency throws, times out or returns partial data.
- Malformed or hostile payloads: wrong type, missing required field, extra fields.

## Output
- Report the SPECIFIC missing case ("no test for empty \`items\`") not "add more tests".
- One finding per distinct gap; group cases that share a single root cause.
- Severity: WARNING when the untested case would corrupt data or crash; otherwise
  SUGGESTION.`,
  },
  {
    name: 'over-mocking-guard',
    description:
      'Use when a test replaces collaborators with mocks. Reject tests that only prove the mock was called; require assertions on real, observable behavior.',
    type: 'convention',
    body: `# Over-mocking guard

A test is worth keeping only if it can fail when the real behavior breaks.

## Red flags
- The unit under test (or part of it) is itself mocked or stubbed.
- The assertion checks a value the test just injected via a stub.
- Assertions are only \`toHaveBeenCalled*\` on internal collaborators, with no check
  of the returned or persisted result.
- In-repo pure helpers, mappers and validators are mocked instead of executed.
- A mock returns a hand-written shape that the real dependency no longer produces
  (drift), e.g. a stubbed DB row missing a newly added column.
- Every dependency is mocked, so the test only exercises wiring.

## Prefer
- Real implementations for pure code; fakes/in-memory adapters at the boundary
  (DB, HTTP, clock), as the repo's DI container allows.
- Assert outcomes: return values, thrown errors, stored state, emitted events.
- Verify calls only for side effects that ARE the contract (e.g. "sends one email").

## Severity
- WARNING: test proves only that a mock was called, or mocks the unit under test.
- SUGGESTION: mocks a pure collaborator that could run for real.

Cite the test file:line where the mock is set up or the vacuous assertion lives.`,
  },
];
