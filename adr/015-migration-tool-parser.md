# ADR-015: The migration tool parses sources with `@typescript/typescript6`

- Status: Accepted
- Date: 2026-11-02

## Context

`openapi-typesafe-migrate` (ENGINEERING_PLAN 10.1) rewrites the legacy `transform` callback of
`openapiTS()` calls: a `ts.factory` type that it returns becomes TypeScript type text, and
`irCallbacks: true` is added. The rewrite must know where an options object, a function body and a
returned expression start and end. A regular expression cannot tell a returned `ts.factory` call from
one in a nested function, or follow a module constant; a parser can.

The `typescript` package's latest release is 7.x, which has no JavaScript API. TypeScript 6 is
published for tools as `@typescript/typescript6` (6.0.2, a wrapper of `typescript@^6`, about 23 MB
installed). The generator itself already treats it as the optional TypeScript-node bridge (ADR-004).

## Decision

1. The migration tool has one runtime dependency, `@typescript/typescript6` (`^6.0.2`). It is used
   only by `src/adapters/typescript-parser/`, behind the `CallbackRewriter` and
   `SourceStringScanner` ports; dependency-cruiser fails the lint if another module imports it.
2. The parser only reads: edits are offsets into the original text, so formatting and comments
   outside the replaced expressions stay as written.
3. The parser also finds the module specifiers that the package rename changes (imports, exports,
   `import()`, `require()`, `import("…")` types and `@import` tags in any JSDoc block,
   `declare module`, `/// <reference types>`, the module methods of vitest, jest and bun). A string that equals a package name in any other place is reported, not renamed: only
   the syntax tells a module specifier from a label or an object key.
4. A callback is rewritten only when every return is a known type-building form (references,
   keywords, literal types, unions, intersections, arrays, the helper constants, module constants
   bound to these). Anything else is left and reported as a manual step.

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| `@typescript/typescript6` (chosen) | Full TypeScript and JSX syntax; same AST the legacy callbacks use | 23 MB install for a one-time `npx` run |
| Regular expressions | No dependency | Cannot find returns or scopes; would corrupt code it does not understand |
| `typescript` 7 | Current compiler | No JavaScript API |
| A smaller parser (Babel, oxc, swc) | Smaller or faster | Another AST to learn, and TypeScript syntax lags behind TypeScript itself |
| No automatic rewrite (manual guide only) | No dependency | Scope-cut (2) of the plan; every legacy user does it by hand |

## Consequences

- `npx openapi-typesafe-migrate` downloads TypeScript 6 once; the tool is not a dependency of any
  project, so the size does not reach users' installs.
- Single-file components (`.vue`, `.svelte`, `.astro`) get the specifier rename in their
  `<script>` blocks (and Astro's frontmatter), but no callback rewrite; their markup is not read.

## Review trigger

TypeScript 7 publishes a JavaScript API, or `@typescript/typescript6` stops being published.
