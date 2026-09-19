---
name: flaky-test-detector
description: Use when reviewing tests. Spot non-determinism (clocks, timers, randomness, shared state, unawaited async, network) that makes a test pass or fail intermittently.
type: rubric
---

# Flaky test detector

A flaky test passes and fails on the same code. Flag any added or changed test that
depends on something the test does not control.

## Time
- Real clocks (`Date.now()`, `new Date()`) compared against fixed values.
- `setTimeout` / `sleep` / fixed waits used to "let things settle" instead of
  awaiting an event, or using fake timers.
- Assertions on elapsed time or durations.

## Randomness and ordering
- Unseeded `Math.random()`, UUIDs or generated ids that reach an assertion.
- Relying on object key, `Set`, `Promise.all` or DB row order without an explicit sort.

## Shared state
- Module-level mutable state or singletons not reset between tests.
- Tests that depend on running order, or on data left by another test.
- Shared ports, files, temp paths or database rows without per-test isolation.

## Async
- Missing `await` on a promise the test asserts on; floating promises.
- `expect` inside a callback that may never run (test passes without asserting).
- Race between a mutation and the read that verifies it.

## External
- Real network, DNS, filesystem or environment-variable dependence.
- Tests that need a particular locale, time zone or CPU speed.

## Report
- Name the exact source of non-determinism and the line that shows it.
- Suggest the fix in one line: fake timers, inject a clock, seed the RNG, await the
  event, isolate the fixture.
- Severity: WARNING for a concrete flake source; SUGGESTION for a fragile pattern
  that is not yet failing.
