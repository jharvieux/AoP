# Flaky test policy

A test is **flaky** when it fails intermittently across 3+ runs on `main` without related
code changes.

## Special rule for this repo

The engine is deterministic by design — every roll flows through a seeded RNG in
`GameState`. **A flaky engine test is therefore never "just flaky": it means impurity
leaked in** (real `Math.random()`/`Date.now()`, iteration-order dependence, shared mutable
state between tests). Treat as a **P1 bug in the engine**, not a test problem, and do not
quarantine it without an issue explaining the suspected impurity.

## Procedure (all other tests)

1. Quarantine: mark the test `.skip` with a comment `// quarantined: #<issue>`.
2. Open an issue labeled `flaky-test` with the failure output and a repro count
   (e.g. "3 failures in 20 runs").
3. **7-day fix clock**: a quarantined test must be fixed or deliberately deleted (with
   rationale in the issue) within 7 days. Quarantine is a holding cell, not a graveyard.
4. A PR may not merge if it adds a `.skip` without a linked `flaky-test` issue.
