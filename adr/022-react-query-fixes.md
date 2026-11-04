# ADR-022: react-query fixes for 1.0, and stricter types for 2.0

- Status: Accepted
- Date: 2026-11-03

## Context

Roadmap R7 (backlog 23) reviews twelve open upstream issues and PRs of `openapi-react-query`
(texts, diffs and reproductions in `.logs/roadmap/R7/`). They are five problems:

1. **`select` infers `unknown`** (#2852; PRs #2873, #2882). Not reproduced: the issue's exact
   schema, a named mapper and `placeholderData: keepPreviousData` compile with the right types on
   this package and on upstream 0.5.4 with `@tanstack/react-query` 5.100.9, TypeScript 5.5, 5.6,
   5.8, 5.9 and 6.0, with and without `exactOptionalPropertyTypes`.
2. **Infinite query key collision** (#2184; PR #2671). `useQuery` and `useInfiniteQuery` for the
   same request use the same key `[method, path, init]`, but cache different data (`TData` and
   `InfiniteData<TData>`). Used together, one reads the other's data and TanStack throws
   `Cannot read properties of undefined (reading 'length')`.
3. **Page param `0`** (#2715, #2340; PR #2826). `queryFn` defaults `pageParam` to `0`, so
   `initialPageParam: undefined` sends `cursor=0` on the first page, which a cursor API rejects.
4. **Query options in the fetch init** (#2642; PR #2857). `useQuery("get", "/me", { retry: false })`
   compiles, and the option is ignored: the third argument is the fetch init, which accepts any
   extra key (`InitWithUnknowns`).
5. **Undeclared parameters** (#2864; PR #2865). `params.query: { declared: 1, undeclared: 2 }`
   compiles: `Init` is inferred from the argument, so no key is excess.

ADR-013 already lets 1.0 change client behavior where the old behavior is a bug with a clear
failure. The roadmap (§3) keeps code that compiles today compiling in 1.x.

## Decision

1. **`select`:** no change. The issue's case is kept as a type test
   (`test/select-inference.test.ts`); a report with a schema that fails reopens it.
2. **Infinite query key:** `useInfiniteQuery` uses `[...queryKey, "infinite"]`, where `queryKey`
   is the key of `queryOptions` for the same request. The key type is exported as
   `InfiniteQueryKey`; the marker is not a runtime export, because a named export next to the
   default export changes what `require()` returns for CommonJS users. The marker goes last, so
   a prefix such as `[method, path]` or the `queryOptions` key still matches the infinite query in
   `invalidateQueries`. `queryFn` takes the request from the hook's arguments, not from the key.
3. **Page param:** an `undefined` page param is left out of the query; any other value, `0`
   included, is sent as before.
4. **Query options in the init, and undeclared parameters:** no type change in 1.x. Both make
   code that compiles today fail to compile, which 1.x does not do (roadmap §3), and an undeclared
   parameter may be on purpose when the schema is incomplete. They are planned for 2.0 (backlog
   items 32 and 33). The `useQuery` docs say where query options go.

## Alternatives

| Option | Pros | Cons |
| --- | --- | --- |
| Marker after the key (chosen) | Prefix invalidation keeps working; one rule | `setQueryData` / `getQueryData` with the old key misses the infinite query |
| A separate key without the init (`[method, path, "infinite"]`) | Short | Two infinite queries with different params share one entry |
| Marker first (`["infinite", method, path, …]`) | Visibly different | `[method, path]` no longer matches infinite queries |
| Keep one key, document "do not mix" | No change | A crash for a normal use; the TanStack docs say keys must differ |
| `pageParam = 0` kept, opt-out flag | No behavior change | A flag for a bug; only `initialPageParam: undefined` is affected, and it never worked |
| Stricter init and parameter types now (PRs #2857, #2865) | Catches mistakes | Breaks compiling code in a minor version; a type-level opt-in adds an option that 2.0 removes |
| `SelectData` rewrite of the hook types (PRs #2873, #2882) | — | Fixes nothing we can reproduce; changes every hook signature |

## Consequences

- Code that reads or writes an infinite query's cache entry with `queryOptions(...).queryKey` (an
  exact key) must append `"infinite"`; the changeset says so. Prefix matches do not
  change.
- A first page with `initialPageParam: undefined` no longer sends the page param.
- Backlog items 32 and 33 hold the 2.0 type changes, with the PRs to start from.

## Review trigger

A reproducible `select` report; the 2.0 planning (items 32, 33); a TanStack Query major version.
