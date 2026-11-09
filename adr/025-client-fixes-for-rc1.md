# ADR-025: Client fixes for 1.0.0-rc.1, and two more type changes for 2.0

- Status: Accepted
- Date: 2026-11-04

## Context

Before 1.0.0-rc.1 we reviewed ten open upstream client bugs of `openapi-fetch`, `openapi-react-query`
and `openapi-typescript-helpers`. Each one was reproduced with a failing test first. ADR-013 lets 1.0
change client behavior where the old behavior is a bug with a clear failure; the roadmap (§3) and
ADR-022 keep code that compiles with upstream compiling in 1.x. 1.0.0-rc.0 is a release candidate,
not a contract: what shipped only in rc.0 may change (maintainer decision, 2026-11-04).

| Bug                                                                              | Root cause                                                                                                                                      |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| #1847: middleware results from undici or another realm throw                     | `instanceof Request` / `Response` / `Headers` checks are false for objects of another implementation                                            |
| #2234: an empty 2xx without `Content-Length`, and every HEAD, fail in `useQuery` | the fetch client gives `data: undefined`, and TanStack Query rejects `undefined` query data; only 204 and `Content-Length: 0` had become `null` |
| #2464: a 204 query is typed `undefined`                                          | the data types used the fetch data type, not the `null` that `queryFn` resolves                                                                 |
| #2526: `createClient<any>()` requires an init                                    | `RequestBodyOption<any>` takes both branches of its conditionals and makes `body` required                                                      |
| #2562: undici `fetch` and `Request` are rejected in client options               | the option types are the DOM ones; DOM and undici types do not relate                                                                           |
| #1862: a `default`-only success gives `data: never`                              | `SuccessResponse` took only `2XX` keys                                                                                                          |
| #2267: the generated `paths` interface fails the react-query method types        | `Record<string, …>` constraints; an interface has no implicit index signature                                                                   |
| #2178: `Parameters<typeof $api.queryOptions>` has `path: never`                  | `Parameters` uses the constraints; `PathsWithMethod<Paths, HttpMethod>` was the paths with every method                                         |
| #2458 / PR #2459: the infinite query page param is `unknown`                     | the hook passed `unknown` as TanStack's `TPageParam`                                                                                            |
| #1882: hundreds of paths give TS2589 and no path completion                      | with an unknown path TypeScript checks the call against all operations of the method; their init was one deep type                              |

## Decision

1. **#1847:** the middleware result checks are structural (`isRequest`: `method`, `url` and
   `headers`; `isResponse`: `status` and `headers`; `isHeaders`). Raw
   bodies (`FormData`, `Blob`) and `instanceof Error` keep `instanceof`.
2. **#2234:** `queryFn` returns `data ?? null`, so every success without a body is `null`.
3. **#2464:** `QueryData` maps `undefined` to `null` in the data, `select` and `DataTag` types of
   `useQuery`, `useSuspenseQuery` and `queryOptions`. This is a 1.x change although it is a type change:
   upstream's `useQuery` of such a response always failed at runtime, so no working code depends on
   `undefined`. Infinite query pages and mutation data stay `undefined` at runtime and in the
   types, as in upstream: TanStack Query accepts them (it rejects `undefined` only as query data),
   so `null` there would only break working code.
4. **#2526:** `RequestBodyOption` checks `IsAny` first and gives `{ body?: any }`.
5. **#2562:** a second overload of `createClient` and `createPathBasedClient` takes any `fetch` and
   `Request` constructor (`CustomFetchClientOptions`, named `OtherFetchClientOptions` in the rc
   versions); the DOM overload stays first.
6. **#1862:** success data comes from `default` when the operation has no `2XX` response.
7. **#2267:** method types take `Paths extends {}`; `PathOperation` picks the operation.
8. **#2178:** `PathsWithMethod<Paths, HttpMethod>` is every path that has some method: TypeScript
   uses `HttpMethod` where a hook's method is not inferred, as in `Parameters`. For a known set of
   methods it stays the paths that have each of them. The init is computed per operation, and it is
   optional only when each operation needs none. `ReturnType` of the generic hooks stays `any`
   (TypeScript does not match them to `ReturnType`'s pattern); the docs say so.

   _Amended before rc.1:_ the first version distributed `PathsWithMethod` over every union of
   methods and kept the init optional when one operation needed none. A call with a union of paths
   then compiled without the path parameter one of them needs (the URL kept `{id}`), and a call
   with a union of methods took a path that lacks one of them. Both had failed in rc.0. A helper
   over `Parameters` now passes `{}` for a path that needs no init.

   _Amended again before rc.1, after the dependents check:_ both types are written so that code
   generic in the paths keeps compiling, as swr-openapi's hooks are.
   - `PathsWithMethod` is upstream's type in a union with `PathsWithAnyMethod<Paths>` when the
     method is all of `HttpMethod`, not a conditional type over the method. TypeScript cannot
     relate `PathsWithMethod<Paths, "get">` to a conditional type that waits for a generic method
     (TS2344). For a known method the second member is `never`.
   - `MaybeOptionalInit` distributes through a type alias, not `extends infer Operation`. While
     the path is generic, TypeScript reads an `infer` type as `unknown`, so the init was no
     contextual type and a literal argument such as `"available"` widened to `string` (TS2322).
   - Inside react-query's `queryFn`, the key's type waits for that per-operation init, so the
     tuple is read with one cast. The exported `QueryKey` is unchanged.
   - The fetch tests have a loader in swr-openapi's shape (`generic-wrappers.test.ts`).
9. **#2458:** the page param type is `initialPageParam` together with the return types of
   `getNextPageParam` and `getPreviousPageParam`. It stays `unknown` when TypeScript cannot infer a
   return type (a return computed from an unannotated `lastPageParam`) or knows only `undefined`/`null`.
   `placeholderData` keeps an `unknown` page param: TypeScript types a `(previousData) =>
   previousData` callback before it infers the page param, so a typed one failed there. The page
   params that `select` gets stay `unknown` for the same reason.
10. **#1882:** fixed by decision 8. The type matrix checks a wrong path and `Parameters<typeof client.GET>`
    on the GitHub schema with TypeScript 5.4 to 7.1. The docs name what remains: with TypeScript 7,
    `Parameters` of `client.request` or `$api.queryOptions` over hundreds of paths hits TS2859.
11. **For 2.0 (backlog items 34 and 35):** excess keys in `params` and `body` (#1525, #1769, #2329) and
    the hook error type without network and middleware errors (#2151, #2372). Both make code that
    compiles with upstream fail.

## Alternatives

| Option                                                              | Pros                                                           | Cons                                                               |
| ------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| Page param from `initialPageParam` only (PR #2459, TanStack's rule) | Same as TanStack                                               | `initialPageParam: undefined` with a string cursor stops compiling |
| Page param from the union (chosen)                                  | Types where they can be inferred; nothing that compiled breaks | An unannotated `lastPageParam` used in the return stays `unknown`  |
| Keep `undefined` in the query data types                            | No type change                                                 | Types a value the query never holds                                |
| Structural checks for raw bodies too                                | Undici `FormData` / `Blob` bodies                              | Larger bundle; a plain object with `stream()` would be sent raw    |
| A third generic for the fetch implementation                        | One overload                                                   | Every client type gets a parameter                                 |
| A fixed init type now (items 34)                                    | Catches misspelled keys                                        | Breaks compiling code in 1.x                                       |
| `error: Response["error"] \| Error` now (item 35)                   | Honest error type                                              | Breaks code that reads the error body without narrowing            |

## Consequences

- `useQuery` data of an operation with a 204 is `Body | null`; code that compared with `undefined` still
  compiles.
- An annotated `lastPageParam` compiles; `data.pageParams` is typed.
- Per-request `fetch` and raw bodies keep the DOM types and `instanceof` checks.
- Backlog items 34 and 35 hold the 2.0 type changes.

## Amendment (2026-11-08): a response is recognized by every member the client reads

Decision 1 recognized a `Response` by `status` and `headers` only. The bug hunt on rc.3
(`RC4_BUGS.md`, item F6) returned `{ status: 200, headers, text }` from `onResponse`, as a
hand-written test double or an adapter for another client might. The client took it, read
`response.ok` as `undefined`, and put the body of a 200 into `error`. openapi-fetch 0.17 rejected
it with `onResponse: must return new Response() when modifying the response`.

1. `isResponse` checks the members the client reads on every response: `ok` (a boolean), `status`
   (a number), `headers` (with `get`) and `text` (a function). A `Response` of any realm or Fetch
   implementation has them; a lookalike without them gets the existing error of its callback
   (`onRequest`, `onResponse` or `onError`).
2. `body` is not checked: a real response may have `body: null`. The other readers (`json`,
   `blob`, `arrayBuffer`) are read only for their `parseAs`, and a missing one fails with the
   platform's `TypeError`.

| Option | Pros | Cons |
| --- | --- | --- |
| Every member read on each response (chosen) | Fails at the callback with the documented message; still realm-safe | A few bytes |
| `instanceof Response` | Exact for one realm | Breaks undici, iframes and Electron again (upstream #1847) |
| Check `ok` only | Fewer bytes | An object without `text()` fails later with a vague `TypeError` |

## Amendment (2026-11-09): responses of a union of paths

The type hunt before rc.4 (T4) found that a call with a union of paths
(`client.GET(p: "/a" | "/b")`) typed `data` wrong; openapi-fetch 0.17 does the same. The response
types read one response map of the union, and `keyof` of a union is only the statuses all members
share: a path without a body in its 2XX response typed `data` as the content map, and a path with
only a `default` response typed it `undefined`.

1. `SuccessResponse` and `ErrorResponse` (openapi-typesafe-helpers) distribute over a union of
   response maps. `data` and `error` of such a call are the union of each operation's types, as
   decision 8 computes the init per operation.
2. For one map the types do not change. On the GitHub and Stripe schemas the check makes about 4%
   fewer type instantiations.
3. A call with an unknown path, which TypeScript checks against every path of the method, now
   types `error` as the union of their errors instead of `undefined`.
4. The client finds each path's item with `Path extends keyof Paths ? Paths[Path] : never`, not
   `Paths[Path & keyof Paths]`: with template keys (`--path-params-as-types`), `/apps/${string}`
   intersected with the keys is also every key it overlaps, such as `/apps/${string}/logs/${number}`,
   and with distributed responses a call got their response bodies too.
5. `union-path-responses.test.ts` checks these calls.

## Amendment (2026-11-09): the `fetch` result is checked too

The response amendment checked the results of `onRequest`, `onResponse` and `onError`, but not the
value a custom `fetch` option returns. A test double `{ status: 200, headers, text }` passed as
`fetch` was taken, `response.ok` was `undefined`, and the body of a 200 went into `error`, as in
openapi-fetch 0.17.

1. The response the client reads after `fetch` and `onError` goes through `isResponse`. A
   lookalike from `fetch` throws `fetch: must return new Response()`, before `onResponse`. A
   Response of any realm or Fetch implementation passes, as in point 1 above.
2. The error is thrown outside `onError`: a wrong `fetch` result is a bug in the client options,
   not a network failure that middleware recovers.

| Option | Pros | Cons |
| --- | --- | --- |
| Check the `fetch` result like middleware results (chosen) | One rule for every door a response comes in through | A few bytes; a hand-written double must be a real `Response` |
| Leave `fetch` unchecked | No change from openapi-fetch | `data` and `error` swap without any error |
| Pass the error to `onError` | Middleware can recover | Hides a bug in the options as a network error |

## Review trigger

The 2.0 planning (items 32 to 35); a TypeScript release that infers return types through a dependent
parameter, or raises the TS2859 limit; a report of a foreign-realm raw body.
