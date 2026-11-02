---
name: tdd
description: Test-driven development. Use when building a feature or fixing a bug that has logic, money, dates, permissions or data changes, when the user mentions tests or "red-green-refactor", or before writing any test.
---

# Test-Driven Development

TDD is the red → green loop. This skill is the reference that makes that loop produce tests worth keeping: what a good test is, where tests go, the anti-patterns, and the rules of the loop. Every section applies on every cycle: consult them before and during the loop, not after.

When exploring the codebase, read the project glossary (`docs/glossary.md` or `GLOSSARY.md`, if it exists) so test names match the business's words, and respect `docs/decisions.md` for the area you're touching.

## What a good test is

Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't. A good test reads like a specification: "user can checkout with valid cart" tells you exactly what capability exists, and it survives refactors because it doesn't care about internal structure.

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.

## Seams: where tests go

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.

**Name the seams before writing any test.** Write down the seams under test, each with a one-line note on what it catches and what it misses. No test is written at an unnamed seam. You can't test everything, so naming seams up front is how testing effort lands on the critical paths and complex logic instead of every edge case.

The seams are your call; the person you work with is not an engineer, so don't ask about them. Ask her only when a business rule is unclear ("should a discount ever be larger than the price?"), and ask it in plain words per the `plain` style. Tests and their output stay in your own work.

## Anti-patterns

- **Implementation-coupled**: mocks internal collaborators, tests private methods, or verifies through a side channel (querying the database instead of using the interface). The tell: the test breaks when you refactor but behavior hasn't changed.
- **Tautological**: the assertion recomputes the expected value the way the code does (`expect(add(a, b)).toBe(a + b)`, a snapshot derived by hand the same way, a constant asserted equal to itself), so it passes by construction and can never disagree with the code. Expected values must come from an independent source of truth: a known-good literal, a worked example, the spec.
- **Horizontal slicing**: writing all tests first, then all implementation. Bulk tests verify _imagined_ behavior: you test the _shape_ of things rather than user-facing behavior, the tests go insensitive to real changes, and you commit to test structure before understanding the implementation. Work in **vertical slices** instead: one test → one implementation → repeat, each test a **tracer bullet** that responds to what the last cycle taught you.

## Rules of the loop

- **Red before green.** Write the failing test first, then only enough code to pass it. Don't anticipate future tests or add speculative features.
- **One slice at a time.** One seam, one test, one minimal implementation per cycle.
- **Refactoring is not part of the loop.** Tidy up after the test is green and the slice is done, not inside the red → green cycle.
