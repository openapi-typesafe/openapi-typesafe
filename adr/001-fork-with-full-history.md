# ADR-001: Fork with full history

- Status: Accepted
- Date: 2026-11-02

## Context

`openapi-typescript` and `openapi-fetch` (about 39M and 44M downloads per month) were declared unmaintained on
2026-09-19 ([upstream issue #2874](https://github.com/openapi-ts/openapi-typescript/issues/2874)). The generator
crashes on TypeScript 7 because it builds output with the TypeScript compiler API. Users need a successor whose
output and client API are compatible, so that migration is a package rename.

The upstream code is MIT-licensed, has 1,679 commits, 771 passing tests, and generated examples for real APIs.

## Decision

Start from a fork of upstream `main` at commit `d46a319a` (tag `fork-base`), keeping the full git history. Rename the
packages (task 1.1), keep every original copyright notice, and explain the fork in `NOTICE`. Replace the
compiler-API internals step by step (ADR-002) behind the existing tests and a corpus harness.

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| Fork with full history (chosen) | Every behavior and test is inherited; `git blame` explains why code exists; credits stay visible | Inherits debt (module-level state, long files, warnings) that must be paid down |
| Fork with squashed history | Smaller repository | Loses the reasons behind edge cases; weaker attribution |
| Rewrite from scratch | Clean design from day one | Months to reach parity; "compatible" would be a claim, not a property; high risk of subtle output drift |

## Consequences

- Compatibility is the starting point and only has to be preserved, not rebuilt.
- Debt is listed in `research/baseline.md` and assigned to phases of the engineering plan.
- Upstream fixes that land after the fork can be cherry-picked (the `upstream` remote has pushing disabled).

## Review trigger

Upstream resumes active maintenance, or names an official successor.
