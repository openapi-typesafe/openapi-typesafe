# ADR-008: Client source language

- Status: Accepted
- Date: 2026-11-02

## Context

`openapi-typesafe-fetch` is written as plain JavaScript (`src/index.js`, about 400 lines) with hand-written
declarations (`src/index.d.ts`). Upstream chose this on purpose: the public types carry complex inference over
user schemas, and keeping them apart from the runtime keeps the runtime small and readable. The cost is drift:
runtime and declarations can disagree. One drift already exists: the runtime exports `randomID`, which the
declarations do not declare (baseline defect B7).

The bundle budget is 7.5 kB (minified); the current build measures 7.41 kB with size-limit 14, so there is very
little headroom. 451 tests check both runtime behavior and types.

## Decision

Keep JavaScript runtime code and hand-written declarations for 1.0. Control drift with tests instead of a rewrite:

1. **Export parity test:** the set of runtime exports equals the set of declared value exports, except an explicit,
   commented allow-list of runtime-only exports kept for compatibility (`randomID`, internal, used for middleware
   request ids).
2. **Export snapshot test:** the public export list is snapshotted; removing an export fails the test (§4.7).
3. **Consumer type matrix:** the declarations are type-checked with `skipLibCheck: false` on every supported
   TypeScript version (ADR-006, task 8.1).
4. The runtime code follows the project's clean-code rules where it changes (JSDoc on exports, no magic values).

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| Keep JS + `.d.ts`, add parity tests (chosen) | Zero behavior and bundle risk; drift becomes a test failure | Two files to keep in sync by hand |
| Convert runtime to TypeScript, keep hand-written public `.d.ts` | Type-checked runtime | Two type layers for one module; emit may grow and break the 90-byte headroom |
| Convert to TypeScript and generate declarations | One source of truth | The complex public types would have to be expressed through implementation signatures; high risk to inference that users depend on |

## Consequences

- A runtime change still needs a matching declaration change; the parity test enforces it.
- `randomID` stays exported at runtime and undeclared, as before; it is documented as internal in the allow-list.

## Review trigger

After 1.0, or the first bug caused by drift between runtime and declarations that the parity test did not catch.
