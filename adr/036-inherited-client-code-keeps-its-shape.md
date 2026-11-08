# ADR-036: Inherited client code keeps its shape until 1.1

- Status: Accepted
- Date: 2026-11-07

## Context

The code-quality audit before 1.0 (B7) found that the size rules of CODING_PRINCIPLES §2.2 were
not configured for `openapi-typesafe-fetch`, `openapi-typesafe-react-query` and
`openapi-typesafe-helpers`. The generator and migrate packages already check them with Biome
(`noExcessiveLinesPerFunction` 30, `useMaxParams` 4) and `lint:sizes` (line length 100, nesting
3). The three packages now use the same rules. Some inherited functions break them (counts from
the audit, before the code was formatted at 100 columns):

| Package | Function | Rule broken |
|---|---|---|
| fetch `src/index.js` | `createClient` | 327 lines |
| fetch `src/index.js` | `coreFetch` (inside `createClient`) | 242 lines; 12 statements nested deeper than 3, the deepest at 7 |
| fetch `src/index.js` | `serializeObjectParam`, `serializeArrayParam`, `defaultPathSerializer` | 41 to 46 lines |
| react-query `src/index.ts` | `createClient` | 82 lines |
| react-query `src/index.ts` | `useInfiniteQuery` (the method type and its implementation) | 5 parameters |

`serializeObjectParam` and `serializeArrayParam` were split into helpers by the fixes of ADR-041
and no longer break the rules.

The code came from openapi-fetch and openapi-react-query and was changed by our fixes (ADR-022,
ADR-025, ADR-030). In this shape it passed the rc.1 acceptance tests A1 to A3 and the full
compatibility run. The fetch bundle is 8.66 kB against a budget of 8.75 kB, so a split of
`coreFetch` into steps has about 90 bytes of room. `useInfiniteQuery(method, path, init, options,
queryClient)` is the public signature of openapi-react-query; a parameter object would break every
caller.

A split of these functions changes no public type or behaviour, so it fits a 1.x minor release.
Before 1.0 it would only add risk to code that the acceptance tests have just passed.

The audit also found that `TypeEvaluator` (generator, ours) had 224 lines, over the 200-line class
limit. That split was small and covered by tests, so it was done (indexed access moved to
`type-indexing.ts`) and is not part of this decision.

## Decision

1. The functions in the table keep their shape in 1.0. Each has a scoped
   `biome-ignore lint/complexity/noExcessiveLinesPerFunction` or
   `biome-ignore lint/complexity/useMaxParams` comment that names this ADR. No other function in
   the three packages may break the rules.
2. `lint:sizes` reads `.ts` files only, so the nesting of fetch `src/index.js` is not checked by a
   machine. The nesting of `coreFetch` is part of this decision; new code in `src/index.js` keeps
   nesting at 3 or less by review.
3. In 1.1 `coreFetch` is split into steps (build the request, `onRequest`, fetch, `onResponse` or
   `onError`, parse), `createClient` of both clients gets smaller with it, and the scoped comments
   are removed, except the one on the public 5-parameter signature of `useInfiniteQuery`, which
   stays until 2.0.

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| Keep the shape until 1.1, scoped suppressions (chosen) | No risk to code that passed acceptance; the rules hold for all new code | Five long functions stay in 1.0 |
| Split `coreFetch` and the serializers before 1.0 | The rules hold everywhere | Large change after acceptance, with 90 bytes of bundle room; needs a new acceptance run |
| Leave the rules off for the three packages | No change at all | New long functions and lines are not caught; the audit found new debt there already |
| A parameter object for `useInfiniteQuery` | Meets the 4-parameter rule | Breaks the openapi-react-query signature that users call |

## Consequences

- Biome fails on any new function over 30 lines or over 4 parameters in the three packages.
- The suppressions are a list of debt with one owner: the 1.1 refactor.
- A refactor in 1.1 must keep the bundle within its budget and pass the compatibility run again.

## Review trigger

Before 1.1.0 is released, or earlier if a bug is fixed in one of the listed functions.
