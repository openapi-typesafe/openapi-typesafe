# Backlog fixes for task 7.4

> Which ten backlog items task 7.4 fixes, and why. Source: `research/backlog.md`, section 5 (candidates). Each
> fix starts with a failing test, references its upstream issues in a changeset, and, when it changes output,
> is listed in the "intentional differences" section of the compatibility report.

## Selection rule

Take the candidates in table order, skipping:

- items already done by earlier tasks: #1 (TS 6 / 7, Phases 4–6) and #2 (Redocly 1.x, decided by ADR-005);
- items that change valid output (`Yes → opt-in`): each needs a new flag, which is a feature, not a fix;
- client items that change runtime behavior or need a design ADR (#10, #11, #12, #15): they belong to task
  7.6 (client hardening).

Items with "No" or "Invalid only" output change and effort S qualify.

## The ten fixes

| # | Candidate | Upstream issues | Package | Output change | Status |
|---:|---|---|---|---|---|
| 1 | Kebab-case boolean flags before the schema path take the path as their value, so the CLI waits on stdin (candidate 3) | #2523, #1651, #2764, #2694 | generator (CLI) | No | Done |
| 2 | `--no-lint` skips Redocly lint (candidate 4) | #2840, #2845 | generator (CLI, Node API) | No (opt-in) | Done |
| 3 | Crash on `%` in a property name (candidate 5) | #2251, #2828 | generator | Invalid only | Done |
| 4 | Crash when a schema property is named `summary` (candidate 6) | #2349 | generator | Invalid only | Done |
| 5 | Invalid `--enum` output: empty member, unescaped `\`, line breaks in `x-enum-descriptions` (candidate 7) | #2807, #2812, #2614, #2838 | generator | Invalid only | Done |
| 6 | `--enum-values` with `--immutable` or nullable parents breaks `FlattenedDeepRequired` (candidate 8) | #2714, #2749, #2737 | generator | Invalid only | Done |
| 7 | `--enum` + `--root-types-no-schema-prefix` name collisions (candidate 9) | #2341, #2206, #2099 | generator | Invalid only | Done |
| 8 | Deterministic middleware request ID instead of `Math.random()` (candidate 13) | #2486, #2763 | fetch | No | Done |
| 9 | Cross-realm `instanceof Function` check in the body serializer (candidate 14) | #2637 | fetch | No | Done |
| 10 | CJS consumers cannot find types / `require` fails (candidate 24) | #2047, #2155, #2342 | generator | No | Done |
