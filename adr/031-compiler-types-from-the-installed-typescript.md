# ADR-031: Public declarations read compiler types from the installed `typescript`

- Status: Accepted
- Date: 2026-11-06

## Context

The deprecated Node API forms (ADR-004) take and return TypeScript compiler nodes: `transform`,
`postTransform`, `transformProperty`, `astToString` input and `formatOptions`, `QUESTION_TOKEN`
and the `ts*` helpers. `dist/index.d.mts` named them as `ts.Node`, `ts.TypeNode` and so on, with
`import ts from "typescript"`.

The `typescript` package of TypeScript 7 has no compiler API; its declarations export only
`version`. A consumer on TypeScript 7 with `skipLibCheck: false` got 23 errors TS2694
("Namespace has no exported member 'Node'") from our declarations, without using any of these
forms. With `skipLibCheck: true` the same names silently became `any`.

The type matrix (ADR-006) did not see it: it checks generated output and the clients, and inside
this repository `typescript` resolves from the generator's directory to the development compiler.

The types cannot simply come from `@typescript/typescript6`: a declaration that imports a package
the consumer has not installed is an error too (TS2307).

## Decision

1. The public node types are read from the API of the installed `typescript` with conditional
   types, not named: `ts.Node` is the parameter type of `isTypeNode`, `ts.TypeNode` that of
   `factory.createArrayTypeNode`, `ts.PropertySignature` the result of
   `factory.createPropertySignature`, and so on (`adapters/type-ast-bridge/typescript-types.ts`).
   With TypeScript 5.x and 6.x they are the compiler's own types, so nothing changes there.
2. Without a compiler API (TypeScript 7) each of them is `any`, which is what such a consumer
   already got with `skipLibCheck: true`. A legacy callback that builds nodes with
   `@typescript/typescript6` keeps compiling; IR callbacks (`irCallbacks: true`) keep their own
   types, because their options name no compiler type.
3. Exported functions name these types in their signatures; none relies on an inferred compiler
   type, which declaration emit would print as `typescript.X` again.
4. `test/declarations-typescript-versions.test.ts` installs the built package into consumer
   projects whose `typescript` is 5.4, 6.x or 7.0 and type-checks them with
   `skipLibCheck: false`. The generator package gets `typescript-5.4` and `typescript-7.0` as
   development dependencies for it, the versions the type matrix already pins.
5. The four errors that remain come from `@redocly/openapi-core` 1.34, whose declarations import
   `json-schema-to-ts` and `js-yaml` without installing their types. openapi-typescript 7.13 has
   the same errors on every TypeScript version. They are documented (installing
   `json-schema-to-ts` and `@types/js-yaml` removes them), not patched.

## Alternatives

| Option | Pros | Cons |
| --- | --- | --- |
| Conditional types over the installed API, `any` without one (chosen) | One declaration file; exact types on 5.x and 6.x; no errors and no change for TypeScript 7 consumers | `any` on TypeScript 7: a union with a node type (the `transform` result) is not checked there, as before |
| Structural node interfaces on TypeScript 7 | Typed | Breaks legacy callbacks that build `@typescript/typescript6` nodes, which compiled before with `skipLibCheck: true` |
| Import the types from `@typescript/typescript6` | Real types on TypeScript 7 | TS2307 for every consumer that has not installed it |
| A second declaration file for TypeScript 7 (`typesVersions`) | Typed per version | Two declaration builds to keep in step; the same choice between `any` and structural types remains |
| Remove the compiler node types from the public API | No `typescript` import at all | Breaks the drop-in promise of 1.x (ADR-004); planned for 2.0 |

## Consequences

- A TypeScript 7 consumer with `skipLibCheck: false` gets no error from our declarations. Without
  any `typescript` package (only a native compiler binary), the import is still TS2307.
- A new public signature with a compiler type must use the types of `typescript-types.ts`; the
  declaration test fails otherwise.
- 2.0 removes the compiler node forms and this module with them.

## Review trigger

TypeScript 7 ships a JavaScript API with node types; `@redocly/openapi-core` stops importing
`json-schema-to-ts` and `js-yaml` in its declarations (then the test's allowance goes); 2.0 planning.
