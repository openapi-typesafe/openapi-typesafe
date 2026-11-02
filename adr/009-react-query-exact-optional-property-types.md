# ADR-009: `exactOptionalPropertyTypes` is off for openapi-typesafe-react-query

- Status: Accepted
- Date: 2026-11-02

## Context

ADR-006 switches `openapi-typesafe-react-query` to the full strict compiler flags in one step. With
`exactOptionalPropertyTypes: true` the package reports 4 errors that are not defects in our code:

- `src/index.ts`: forwarding `options` and spreading `restOptions` into TanStack Query's `useQuery`,
  `useSuspenseQuery` and `useInfiniteQuery` fails because TanStack's option types declare optional properties
  (for example `subscribed?: boolean`) that its own derived types expose as `boolean | undefined`;
- `test/fixtures/mock-server.ts`: passing `headers: Record<string, string> | undefined` to msw's `HttpResponse.json`.

Making these compile would require casts at every call into the libraries or changes to our public option types.
Both are worse than the flag: casts hide real errors, and public type changes break users.

All other strict flags (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`) are on
and pass.

## Decision

Set `exactOptionalPropertyTypes: false` in `packages/openapi-typesafe-react-query/tsconfig.json`. Every other flag of
`tsconfig.strict.json` applies. This flag affects only how this package's source is checked; consumers keep their own
settings, and the consumer matrix (task 8.1) checks the published declarations with `exactOptionalPropertyTypes` on.

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| Turn the one flag off for this package (chosen) | No casts, no public type changes | The package does not get this check |
| Keep the flag and cast at each library call | Flag stays on | Casts hide real type errors exactly where library types meet ours |
| Change public option types to add `\| undefined` | Flag stays on | A public type change in a drop-in package |

## Consequences

The exception is local, written down, and covered by consumer type tests.

## Review trigger

A TanStack Query release whose option types compile with `exactOptionalPropertyTypes`.
