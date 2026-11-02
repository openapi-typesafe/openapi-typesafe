# ADR-002: Own Type IR and string printer instead of the TypeScript compiler API

- Status: Accepted
- Date: 2026-11-02

## Context

19 of the 20 generator source files import `typescript`. Transformers build `ts.Node` objects with `ts.factory`
and print them with the TypeScript printer. TypeScript 7 (native port) does not expose `ts.factory`; its
programmatic API is published only under `./unstable/*`, and TypeScript 7.1 announces a different API. The
generator therefore crashes on TypeScript 7 (`ts.factory` is undefined), and any binding to a compiler API ties the
generator to one TypeScript major version.

The output is a narrow subset of TypeScript: type aliases, interfaces, enums, `const` arrays, and type expressions
(literals, references, unions, intersections, objects with index signatures, arrays, tuples, indexed access,
`readonly`, a few utility types), plus JSDoc comments.

## Decision

1. Introduce a small, closed, immutable **Type IR** in `domain/ir/` that describes exactly the declarations and type
   expressions the generator emits (ENGINEERING_PLAN §4.2). Nodes are plain readonly data with a `kind`
   discriminator; dispatch is an exhaustive `switch` with a `never` check.
2. Print the IR with a pure, deterministic **string printer** (§4.3) that reproduces the current output byte for
   byte, verified per construct against the TypeScript printer (task 4.3) and per schema on the corpus (Phase 2).
3. The IR has no implicit normalization; de-duplication and sorting are explicit functions called where the current
   code calls them.
4. The generator has no runtime dependency on `typescript`. The only exception is the optional, lazily loaded
   bridge for legacy `ts.Node` callbacks (ADR-004).

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| Own IR + string printer (chosen) | Works on every TypeScript version; small and fully testable; no install-time peer conflicts | Printer must match the TypeScript printer's formatting exactly; needs parity tests |
| Keep `ts.factory`, pin `typescript` ≤ 6 as a dependency | Smallest code change | Ships a second compiler (~20 MB) to every user; still breaks for users who want only TS 7; postpones the problem |
| Port to the TS 7 unstable API | Uses the official compiler | API is explicitly unstable and changes again in 7.1; ties releases to TypeScript's schedule |
| Template strings without an IR | Fewer types | Escaping, quoting and JSDoc rules scattered across transformers; hard to test; callbacks cannot inspect structure |

## Consequences

- Transformers are migrated one at a time (strangler pattern, Phase 5) with a temporary IR → `ts.Node` converter,
  so the inherited tests stay green at every step.
- `openapiTS()` returns IR nodes instead of `ts.Node[]` from Phase 6; `astToString()` accepts them. Code that passes
  the result straight to `astToString()` keeps working. This is the one listed Node API difference.
- Exported AST helpers (`tsUnion`, `tsLiteral`, …) are re-implemented over the IR with the same names and signatures.

## Review trigger

TypeScript publishes a stable, versioned programmatic API for creating and printing type nodes that works across
majors, or the IR grows beyond what the output needs.
