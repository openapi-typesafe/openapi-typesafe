# openapi-typesafe-react-query

This package is a fork of `openapi-react-query`. The entries above `0.5.4` are releases of openapi-typesafe-react-query; `0.5.4` and the entries below it are the upstream history up to the fork point (upstream commit `d46a319a`), with `openapi-react-query` versions.

## 1.0.0-rc.4

### Patch Changes

- [#60](https://github.com/openapi-typesafe/openapi-typesafe/pull/60) [`fc5608a`](https://github.com/openapi-typesafe/openapi-typesafe/commit/fc5608afc7bb1ece3bb4201ff95e5ff3421a1dc1) Thanks [@fedorello](https://github.com/fedorello)! - The hooks name the helper types through `openapi-typesafe-fetch`, and `openapi-typesafe-helpers`
  is no longer a dependency. A library built with `declaration: true` under pnpm or Yarn PnP that
  uses the hooks gets declarations that name `openapi-typesafe-fetch`, which it depends on: no TS2742
  ("cannot be named without a reference to …/openapi-typesafe-helpers") under pnpm, and no
  `import("openapi-typesafe-helpers")` that its users cannot resolve under Yarn PnP.
  openapi-react-query fails the same way. TanStack Query's own types keep two limits in a file that
  does not import `@tanstack/react-query`: TS2742 under pnpm with TypeScript 5.4 (5.5 and later
  work), and `import("@tanstack/query-core")` under Yarn PnP; the react-query docs ("Libraries that
  export hooks") give the fixes.

- [#56](https://github.com/openapi-typesafe/openapi-typesafe/pull/56) [`1b565d3`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1b565d347fd84c09b7e660ebcb4c130a0df8df24) Thanks [@fedorello](https://github.com/fedorello)! - A library that exports a `$api.queryOptions(...)` result gets declarations that its users can
  read: the tagged `queryKey` is typed with the exported `QueryKeyWithDataTag` (TanStack Query's
  type of that name, for every version of the peer range). The declarations spelled out TanStack's
  `[dataTagSymbol]` keys without an import, so the library's users failed with TS2304, or got `any`
  from `queryClient.getQueryData(options.queryKey)` with `skipLibCheck`.
- Updated dependencies [[`bc4d41d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/bc4d41d870d13fdb5eb1303744e5235308cdc2bb), [`1c8af0d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1c8af0dc371ae8be5b595b055ee1ebc53916088f), [`2afc816`](https://github.com/openapi-typesafe/openapi-typesafe/commit/2afc816881dab23d3dd8fe4d1a2d20456dd917f8), [`cff72cd`](https://github.com/openapi-typesafe/openapi-typesafe/commit/cff72cd19bf7a68429f302e0ece79304fcb6ba5c), [`bc4d41d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/bc4d41d870d13fdb5eb1303744e5235308cdc2bb), [`1c8af0d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1c8af0dc371ae8be5b595b055ee1ebc53916088f), [`cff72cd`](https://github.com/openapi-typesafe/openapi-typesafe/commit/cff72cd19bf7a68429f302e0ece79304fcb6ba5c)]:
  - openapi-typesafe-fetch@1.0.0-rc.4

## 1.0.0-rc.3

### Patch Changes

- Updated dependencies []:
  - openapi-typesafe-fetch@1.0.0-rc.3
  - openapi-typesafe-helpers@1.0.0-rc.3

## 1.0.0-rc.2

### Major Changes

- [#18](https://github.com/openapi-typesafe/openapi-typesafe/pull/18) [`bfd3e60`](https://github.com/openapi-typesafe/openapi-typesafe/commit/bfd3e605bdbe240d7a8a327a59d8924781016fbd) Thanks [@fedorello](https://github.com/fedorello)! - First stable release of openapi-typesafe-react-query, the successor of openapi-react-query 0.5.4.
  Its peer dependency is now `openapi-typesafe-fetch` instead of `openapi-fetch`, next to
  `@tanstack/react-query` 5.80 or newer. From 1.0 the package follows semver.

  Changes that can need work when you move from openapi-react-query 0.5.4:
  - `engines.node` is `>=22`.
  - Queries and mutations fail on every non-OK response, also one without a body or with a falsy
    body such as `0` (upstream [#2070](https://github.com/openapi-ts/openapi-typescript/issues/2070), [#2531](https://github.com/openapi-ts/openapi-typescript/issues/2531)).
  - `useInfiniteQuery` has its own key, `[...queryKey, "infinite"]`, so it no longer shares a cache
    entry with `useQuery` (upstream [#2184](https://github.com/openapi-ts/openapi-typescript/issues/2184)). Prefix matches still work; code that uses the exact
    key must append `"infinite"`.
  - An `undefined` page param is left out of the request; it was sent as `0` (upstream [#2715](https://github.com/openapi-ts/openapi-typescript/issues/2715),
    [#2340](https://github.com/openapi-ts/openapi-typescript/issues/2340)).

### Patch Changes

- [#16](https://github.com/openapi-typesafe/openapi-typesafe/pull/16) [`cd79dbd`](https://github.com/openapi-typesafe/openapi-typesafe/commit/cd79dbd39d33dc913ec101a4c46560dff801da4e) Thanks [@fedorello](https://github.com/fedorello)! - The type declarations keep their JSDoc, so editors show descriptions and mark deprecated exports.
- Updated dependencies [[`cd79dbd`](https://github.com/openapi-typesafe/openapi-typesafe/commit/cd79dbd39d33dc913ec101a4c46560dff801da4e), [`bfd3e60`](https://github.com/openapi-typesafe/openapi-typesafe/commit/bfd3e605bdbe240d7a8a327a59d8924781016fbd), [`bfd3e60`](https://github.com/openapi-typesafe/openapi-typesafe/commit/bfd3e605bdbe240d7a8a327a59d8924781016fbd), [`5837bac`](https://github.com/openapi-typesafe/openapi-typesafe/commit/5837baca3bbcd58bd132622d9a4723e97bc5a9bc), [`5837bac`](https://github.com/openapi-typesafe/openapi-typesafe/commit/5837baca3bbcd58bd132622d9a4723e97bc5a9bc), [`cd79dbd`](https://github.com/openapi-typesafe/openapi-typesafe/commit/cd79dbd39d33dc913ec101a4c46560dff801da4e)]:
  - openapi-typesafe-helpers@1.0.0-rc.2
  - openapi-typesafe-fetch@1.0.0-rc.2

## 1.0.0-rc.1

### Patch Changes

- [#11](https://github.com/openapi-typesafe/openapi-typesafe/pull/11) [`578bd5d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/578bd5df6e6937cc3a8870a78ff84bfa6837f0b7) Thanks [@fedorello](https://github.com/fedorello)! - The CommonJS declarations (`dist/index.d.cts`) now say what `require()` returns, as in
  openapi-fetch and openapi-react-query they did not. For the fetch client it is
  `{ default, ...named }`: `import createClient = require("openapi-typesafe-fetch")` type-checked
  and then failed at runtime with "createClient is not a function"; use `.default` or a default
  import. For the react-query client it is `createClient` itself; the exported types next to its
  `export =` were an error (TS2309) with `skipLibCheck: false`, and are now in a namespace merged with
  the function, so `import type { QueryKey } from "openapi-typesafe-react-query"` still works. Default
  imports and ES modules do not change.

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - The data types of `useQuery`, `useSuspenseQuery` and `queryOptions` say `null` for a successful
  response without a body, the value `queryFn` gives. A 204 was typed `undefined`, which the query
  data never is (upstream [#2464](https://github.com/openapi-typesafe/openapi-typesafe/issues/2464)). `select` gets `Body | null` for an operation with a 200 and a 204.
  `useInfiniteQuery` and `useMutation` are unchanged.

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - `useQuery`, `useSuspenseQuery` and `queryOptions` give `data: null` for every successful response
  without a body. Only a 204 and `Content-Length: 0` did; an empty chunked body and a HEAD request
  gave `undefined`, and TanStack Query failed with "Query data cannot be undefined" (upstream [#2234](https://github.com/openapi-typesafe/openapi-typesafe/issues/2234)).

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - `useInfiniteQuery` types the page param: `lastPageParam` and `data.pageParams` get the type of
  `initialPageParam` together with the return types of `getNextPageParam` and
  `getPreviousPageParam`. They were `unknown` (upstream [#2458](https://github.com/openapi-typesafe/openapi-typesafe/issues/2458), PR [#2459](https://github.com/openapi-typesafe/openapi-typesafe/issues/2459)). An annotated
  `lastPageParam`, such as `(lastPage, allPages, lastPageParam: number) => lastPageParam + 1`, now
  compiles. Where no type can be inferred (a return computed from an unannotated `lastPageParam`,
  or only `undefined`), the page param stays `unknown`, so code that compiled still compiles. It
  stays `unknown` in `placeholderData` too, so `placeholderData: (previousData) => previousData`
  compiles.

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - `Parameters<typeof $api.queryOptions>` (and of `useQuery`, `useSuspenseQuery` and the fetch
  client's `request`) takes the arguments of every operation; its path was `never` (upstream [#2178](https://github.com/openapi-typesafe/openapi-typesafe/issues/2178)).
  `PathsWithMethod<paths, HttpMethod>` is now every path that has some method; a known method or set
  of methods still gives the paths that have each of them, as before. Code that is generic in the
  paths, such as swr-openapi's hooks, compiles as with openapi-typescript's helpers. The init in those parameters is required when some operation
  requires one (`IsInitOptional`), so a helper passes `{}` for a path that needs none. A single call
  is checked as before, also with a union of paths or methods.
  `ReturnType` of these generic functions stays `any`; the `queryOptions` docs show what to use.

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - The method types take the generated `interface paths`: `UseQueryMethod`, `UseSuspenseQueryMethod`,
  `UseInfiniteQueryMethod`, `UseMutationMethod`, `QueryOptionsFunction`, `QueryKey`,
  `InfiniteQueryKey`, `ClientMethod` and `ClientRequestMethod` required
  `Record<string, Record<HttpMethod, {}>>`, which an interface does not satisfy (TS2344, upstream
  [#2267](https://github.com/openapi-typesafe/openapi-typesafe/issues/2267)). They now take any `Paths`, like `OpenapiQueryClient` and `Client`. `PathOperation` is the
  new exported lookup of an operation; `MaybeOptionalInit` takes any key as its location.
- Updated dependencies [[`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01), [`578bd5d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/578bd5df6e6937cc3a8870a78ff84bfa6837f0b7), [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01), [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01), [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01), [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01), [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01), [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01)]:
  - openapi-typesafe-fetch@1.0.0-rc.1
  - openapi-typesafe-helpers@1.0.0-rc.1

## 1.0.0-rc.0

### Minor Changes

- [`551c058`](https://github.com/openapi-typesafe/openapi-typesafe/commit/551c05889d32eaf1d328111e5c4d167e0337e5a4) Thanks [@fedorello](https://github.com/fedorello)! - The OpenAPI 3.2 `QUERY` method: `HttpMethod` includes `"query"`, the fetch client has
  `client.QUERY(url, { body })` (also through `request("query", …)` and the path-based client), and
  the react-query hooks accept `"query"`. A `Record<HttpMethod, …>` written by hand needs a `query`
  entry. The path-based client maps only HTTP method keys, so `parameters` no longer shows up as a
  `PARAMETERS()` call that always failed.

- [`d094aa4`](https://github.com/openapi-typesafe/openapi-typesafe/commit/d094aa498157bb8b898b4d97100391058a72d9b9) Thanks [@fedorello](https://github.com/fedorello)! - `useInfiniteQuery` gets its own query key, `[...queryKey, "infinite"]` (type
  `InfiniteQueryKey`), so `useQuery` and `useInfiniteQuery` for the
  same request no longer share a cache entry and crash (openapi-typescript [#2184](https://github.com/openapi-typesafe/openapi-typesafe/issues/2184)). `[method, path]`
  and the `queryOptions` key still match it as a prefix in `invalidateQueries`; code that reads or
  writes the infinite entry with the exact `queryOptions` key must append `"infinite"`.

  An `undefined` page param, such as the first page with `initialPageParam: undefined`, is left out
  of the request instead of being sent as `0` (openapi-typescript [#2715](https://github.com/openapi-typesafe/openapi-typesafe/issues/2715), [#2340](https://github.com/openapi-typesafe/openapi-typesafe/issues/2340)). ADR-022.

### Patch Changes

- [`e49344a`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e49344a208fb3bb38cd86f62c1395f8f7ca950f6) Thanks [@fedorello](https://github.com/fedorello)! - Packages contain only their build output, sources for source maps, the CLI, and the README, license and changelog. Coverage reports, local logs and tool configs are no longer packed.

- [`ac9d082`](https://github.com/openapi-typesafe/openapi-typesafe/commit/ac9d0821aba779b8effc6cf71efb0583cfaaaad6) Thanks [@freshgiammi](https://github.com/freshgiammi)! - Tag generated querykeys with `DataTag`, allowing us to infer the return type (data/error) associated with a given queryKey, making methods like `queryClient.setQueryData()` type-safe.

- [`dd39753`](https://github.com/openapi-typesafe/openapi-typesafe/commit/dd3975356a6ac13075fe7e64c1f8c357dbc658d7) Thanks [@fedorello](https://github.com/fedorello)! - Queries, infinite queries and mutations fail on every non-OK response. Before, a 4xx/5xx response without a body (`error: undefined`) or with a falsy body such as `0` counted as success (ADR-013). Fixes upstream [#2070](https://github.com/openapi-typesafe/openapi-typesafe/issues/2070), [#2531](https://github.com/openapi-typesafe/openapi-typesafe/issues/2531) (as [#2829](https://github.com/openapi-typesafe/openapi-typesafe/issues/2829) proposed).
- Updated dependencies [[`16f572f`](https://github.com/openapi-typesafe/openapi-typesafe/commit/16f572fd582fbabe058abad2604ffb3299ddc97a), [`2b3671f`](https://github.com/openapi-typesafe/openapi-typesafe/commit/2b3671f126f78e24ead7ad785a55b79540ae9092), [`e49344a`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e49344a208fb3bb38cd86f62c1395f8f7ca950f6), [`b775891`](https://github.com/openapi-typesafe/openapi-typesafe/commit/b775891e2ac748aeab4cb3106c1df44a0b7ddf30), [`bb9d754`](https://github.com/openapi-typesafe/openapi-typesafe/commit/bb9d754cbb4133ac1ae09f1a340af455f9482ecc), [`4091466`](https://github.com/openapi-typesafe/openapi-typesafe/commit/40914664dd3d9aba10c2720a78d226ba9355e5ba), [`3786df3`](https://github.com/openapi-typesafe/openapi-typesafe/commit/3786df3482727d6b728b7409ebc9ee8b66f3b97c), [`551c058`](https://github.com/openapi-typesafe/openapi-typesafe/commit/551c05889d32eaf1d328111e5c4d167e0337e5a4), [`77e1425`](https://github.com/openapi-typesafe/openapi-typesafe/commit/77e1425ac5b45833f2a69e12448056292f71803f), [`63275f8`](https://github.com/openapi-typesafe/openapi-typesafe/commit/63275f86ff7ba855338f09f87fb9567c8ed91300), [`d5dcbb3`](https://github.com/openapi-typesafe/openapi-typesafe/commit/d5dcbb3f38e4d583334977c50db92461085d4a11), [`4ddbce1`](https://github.com/openapi-typesafe/openapi-typesafe/commit/4ddbce1079976752abb426e79d27a744f9fe1cb3), [`f8ac0d6`](https://github.com/openapi-typesafe/openapi-typesafe/commit/f8ac0d6e8f35d317ccb41758b7a2f3dc1ecf1f87)]:
  - openapi-typesafe-fetch@1.0.0-rc.0
  - openapi-typesafe-helpers@1.0.0-rc.0

## 0.5.4

### Patch Changes

- Updated dependencies [[`9350ddf`](https://github.com/openapi-ts/openapi-typescript/commit/9350ddfcd44b661a5288667ebfcf298868dd9784), [`a690e52`](https://github.com/openapi-ts/openapi-typescript/commit/a690e526b7693479bc2f2f002d71a020fa5e4e16)]:
  - openapi-fetch@0.17.0
  - openapi-typescript-helpers@0.1.0

## 0.5.3

### Patch Changes

- Updated dependencies [[`9002418`](https://github.com/openapi-ts/openapi-typescript/commit/90024185c7a251b5dbedd148e4eb5d15b95409c8)]:
  - openapi-fetch@0.16.0

## 0.5.2

### Patch Changes

- [#2519](https://github.com/openapi-ts/openapi-typescript/pull/2519) [`681ac87`](https://github.com/openapi-ts/openapi-typescript/commit/681ac876c4c5c20ad27c43b0960aabdbc247c59a) Thanks [@sacha-c](https://github.com/sacha-c)! - fixes mutation results type

## 0.5.1

### Patch Changes

- Updated dependencies [[`8f96eb5`](https://github.com/openapi-ts/openapi-typescript/commit/8f96eb50f5ec060e2e9100e9a43d3fe98e9795c5)]:
  - openapi-fetch@0.15.0

## 0.5.0

### Minor Changes

- [#2310](https://github.com/openapi-ts/openapi-typescript/pull/2310) [`e66b5ce`](https://github.com/openapi-ts/openapi-typescript/commit/e66b5ce63bfcdc57c6ee942e5ed4e7667e64c290) Thanks [@drwpow](https://github.com/drwpow)! - Build package with unbuild to improve CJS support

### Patch Changes

- Updated dependencies [[`e66b5ce`](https://github.com/openapi-ts/openapi-typescript/commit/e66b5ce63bfcdc57c6ee942e5ed4e7667e64c290)]:
  - openapi-fetch@0.14.0

## 0.4.2

### Patch Changes

- [#2235](https://github.com/openapi-ts/openapi-typescript/pull/2235) [`694522a`](https://github.com/openapi-ts/openapi-typescript/commit/694522a7ccf90767e9de29c786794f8ddcbc08bd) Thanks [@wheelebin](https://github.com/wheelebin)! - React query handle 204 or zero content length
- Updated dependencies [[`81c031d`](https://github.com/openapi-ts/openapi-typescript/commit/81c031da8584ed49b033ebfc67bbb3e1ca258699)]:
  - openapi-fetch@0.13.8

## 0.4.1

### Patch Changes

- Updated dependencies [[`30c6da8`](https://github.com/openapi-ts/openapi-typescript/commit/30c6da800a00bda87da66dea6d04807e1379f06a)]:
  - openapi-fetch@0.13.7

## 0.4.0

### Minor Changes

- [#2169](https://github.com/openapi-ts/openapi-typescript/pull/2169) [`a76801c`](https://github.com/openapi-ts/openapi-typescript/commit/a76801cdc04fe9d2c28756a050861c6e673aa325) Thanks [@awmichel](https://github.com/awmichel)! - [#2169](https://github.com/openapi-ts/openapi-typescript/pull/2169): Infer returned `data` type from `select` option when used with the `useInfiniteQuery` method.

## 0.3.2

### Patch Changes

- Updated dependencies [[`4966560`](https://github.com/openapi-ts/openapi-typescript/commit/4966560790ad49fabb06d718115a82a779a5b74a)]:
  - openapi-fetch@0.13.6

## 0.3.1

### Patch Changes

- Updated dependencies [[`ebe56f3`](https://github.com/openapi-ts/openapi-typescript/commit/ebe56f337561bfdd1bf1abdc56ba3d2f48c4d393)]:
  - openapi-fetch@0.13.5

## 0.3.0

### Minor Changes

- [#1881](https://github.com/openapi-ts/openapi-typescript/pull/1881) [`ccbc2e3`](https://github.com/openapi-ts/openapi-typescript/commit/ccbc2e3f68ced4d3038b9003064fe449925b55dc), [#2117](https://github.com/openapi-ts/openapi-typescript/pull/2117) [`3ef38b8`](https://github.com/openapi-ts/openapi-typescript/commit/3ef38b8b9371bc2a2ade202a6dc864b765446305) Thanks [@jungwoo3490](https://github.com/jungwoo3490), [@lukasedw](https://github.com/lukasedw)! - Implements useInfiniteQuery() in openapi-react-query

### Patch Changes

- [#2120](https://github.com/openapi-ts/openapi-typescript/pull/2120) [`efea325`](https://github.com/openapi-ts/openapi-typescript/commit/efea32521ffa1557547a0000051cc73157be5a61) Thanks [@drwpow](https://github.com/drwpow)! - Fix minor type error with latest version of TanStack Query

- [#2061](https://github.com/openapi-ts/openapi-typescript/pull/2061) [`6871e73`](https://github.com/openapi-ts/openapi-typescript/commit/6871e73b4c004560ba514d19c0f1f948ba63f5c8) Thanks [@kevmo314](https://github.com/kevmo314)! - Drop init argument when not needed in query key

- [#2114](https://github.com/openapi-ts/openapi-typescript/pull/2114) [`0c35b32`](https://github.com/openapi-ts/openapi-typescript/commit/0c35b321778afe0705d7fd7a8375c4e10d5f95c2) Thanks [@kerwanp](https://github.com/kerwanp)! - [#2098](https://github.com/openapi-ts/openapi-typescript/pull/2098): Fix CJS type issues by pointing to proper d.ts file

- [#1945](https://github.com/openapi-ts/openapi-typescript/pull/1945) [`248195d`](https://github.com/openapi-ts/openapi-typescript/commit/248195df11f186e379005d487ad9113c3bdd32a9) Thanks [@freshgiammi](https://github.com/freshgiammi)! - Add MethodResponse to get the return type of an endpoint from an `OpenapiQueryClient` client.

- Updated dependencies []:
  - openapi-fetch@0.13.4

## 0.2.10

### Patch Changes

- [#2105](https://github.com/openapi-ts/openapi-typescript/pull/2105) [`af0e72f`](https://github.com/openapi-ts/openapi-typescript/commit/af0e72f16f1515f2953a719d7f58c76ec27637ea) Thanks [@HagenMorano](https://github.com/HagenMorano)! - [#1845](https://github.com/openapi-ts/openapi-typescript/pull/2105): The return value of the `select` property is now considered when inferring the `data` type.

## 0.2.9

### Patch Changes

- Updated dependencies [[`5935cd2`](https://github.com/openapi-ts/openapi-typescript/commit/5935cd25a05d3ec1f4c8bf222d65395a0b9ae5b4)]:
  - openapi-fetch@0.13.4

## 0.2.8

### Patch Changes

Refresh of 0.2.7; corrupted package

## 0.2.7

### Patch Changes

- Updated dependencies [[`7081842`](https://github.com/openapi-ts/openapi-typescript/commit/70818420c1cd6ca2ad2529bf2d7936bd01f3ef42)]:
  - openapi-fetch@0.13.2

## 0.2.6

### Patch Changes

- Updated dependencies [[`35c576c`](https://github.com/openapi-ts/openapi-typescript/commit/35c576c8b2852f66e641014d13ffcfdeb21e98a1)]:
  - openapi-fetch@0.13.1

## 0.2.5

### Patch Changes

- [#1975](https://github.com/openapi-ts/openapi-typescript/pull/1975) [`621792f`](https://github.com/openapi-ts/openapi-typescript/commit/621792f23b0b8830949f3c1e25fe480557016b9a) Thanks [@HugeLetters](https://github.com/HugeLetters)! - - Fixed empty value check in queryFn: only throws error for undefined, other falsy values are allowed
  - Fixed empty value check in mutationFn: allow falsy values

## 0.2.4

### Patch Changes

- [#1952](https://github.com/openapi-ts/openapi-typescript/pull/1952) [`455b735`](https://github.com/openapi-ts/openapi-typescript/commit/455b73527c788918d665a3d607e8ac240a4e5e52) Thanks [@zsugabubus](https://github.com/zsugabubus)! - Fix return type inference for `queryOptions()` when used inside `useQuery` or `useSuspenseQuery`.

- [#1952](https://github.com/openapi-ts/openapi-typescript/pull/1952) [`455b735`](https://github.com/openapi-ts/openapi-typescript/commit/455b73527c788918d665a3d607e8ac240a4e5e52) Thanks [@zsugabubus](https://github.com/zsugabubus)! - Narrow `queryFn` returned by `queryOptions()` to be a function.

## 0.2.3

### Patch Changes

- Updated dependencies [[`06163a2`](https://github.com/openapi-ts/openapi-typescript/commit/06163a2030eaf8d0579f624d86481e1205aef396)]:
  - openapi-typescript-helpers@0.0.15
  - openapi-fetch@0.12.5

## 0.2.2

### Patch Changes

- Updated dependencies [[`abfad56`](https://github.com/openapi-ts/openapi-typescript/commit/abfad5659183f95f705598dc52ae2dfe7a18ec04)]:
  - openapi-typescript-helpers@0.0.14
  - openapi-fetch@0.12.4

## 0.2.1

### Patch Changes

- Updated dependencies [[`d14aa65`](https://github.com/openapi-ts/openapi-typescript/commit/d14aa65207b8abd1f369965bbd32ebb581e8d741)]:
  - openapi-fetch@0.12.3

## 0.2.0

### Minor Changes

- [#1858](https://github.com/openapi-ts/openapi-typescript/pull/1858) [`29bd162`](https://github.com/openapi-ts/openapi-typescript/commit/29bd162dccf441abbb33f07c6158410fd81a85d7) Thanks [@zsugabubus](https://github.com/zsugabubus)! - Introduce `queryOptions` that can be used as a building block to integrate with `useQueries`/`fetchQueries`/`prefetchQueries`… etc.

## 0.1.7

### Patch Changes

- Updated dependencies [[`e39d11e`](https://github.com/openapi-ts/openapi-typescript/commit/e39d11e5ac4e7f5fc2ce81e8a6d7792f91a6551a)]:
  - openapi-fetch@0.12.2

## 0.1.6

### Patch Changes

- Updated dependencies [[`efaa1e2`](https://github.com/openapi-ts/openapi-typescript/commit/efaa1e23b9cb0901fe026e48fbb4b347f0c95507)]:
  - openapi-fetch@0.12.1

## 0.1.5

### Patch Changes

- [#1864](https://github.com/openapi-ts/openapi-typescript/pull/1864) [`899b157`](https://github.com/openapi-ts/openapi-typescript/commit/899b1575968334bc55aa402ea1419bc5db801391) Thanks [@zsugabubus](https://github.com/zsugabubus)! - Pass down signal to fetch function this way `useQuery` and `useSuspenseQuery` can cancel queries.

- Updated dependencies []:
  - openapi-fetch@0.12.0

## 0.1.4

### Patch Changes

- Updated dependencies [[`b893c44`](https://github.com/openapi-ts/openapi-typescript/commit/b893c44f4290917f24c2ef7cda106c540df9cb3d)]:
  - openapi-fetch@0.12.0

## 0.1.3

### Patch Changes

- Updated dependencies [[`2a4b067`](https://github.com/openapi-ts/openapi-typescript/commit/2a4b067f43f7e0b75aecbf5c2fb3013a4e96e591), [`0e42cbb`](https://github.com/openapi-ts/openapi-typescript/commit/0e42cbb98e2a023c33685de65ab0b8dbf82cc4b3)]:
  - openapi-fetch@0.11.2

## 0.1.2

### Patch Changes

- [#1833](https://github.com/openapi-ts/openapi-typescript/pull/1833) [`cec023d`](https://github.com/openapi-ts/openapi-typescript/commit/cec023d3461c79ca355a88366949d0f6382e4e2a) Thanks [@ngraef](https://github.com/ngraef)! - Fix identification of required properties when `strictNullChecks` is disabled

- Updated dependencies [[`091e71a`](https://github.com/openapi-ts/openapi-typescript/commit/091e71ad4bf805be32261a53524f320c2fa42690), [`cec023d`](https://github.com/openapi-ts/openapi-typescript/commit/cec023d3461c79ca355a88366949d0f6382e4e2a)]:
  - openapi-fetch@0.11.1
  - openapi-typescript-helpers@0.0.12

## 0.1.1

### Patch Changes

- Updated dependencies [[`a956d5d`](https://github.com/openapi-ts/openapi-typescript/commit/a956d5d8480834402536283ee2f24ce8086698dc)]:
  - openapi-fetch@0.11.0

## 0.1.0

### Minor Changes

- [#1814](https://github.com/openapi-ts/openapi-typescript/pull/1814) [`2a044d0`](https://github.com/openapi-ts/openapi-typescript/commit/2a044d029ec089e391703a4cdc1340f3b5c1b543) Thanks [@yoshi2no](https://github.com/yoshi2no)! - feat: Allow passing a queryClient as an argument to the `useQuery`, `useMutation`, and `useSuspenseQuery` methods

### Patch Changes

- Updated dependencies [[`f21c05b`](https://github.com/openapi-ts/openapi-typescript/commit/f21c05b9afcc89ee6ef73edab4045620b410eb01), [`ba0d595`](https://github.com/openapi-ts/openapi-typescript/commit/ba0d595556661053b5ef310afafec4fcc116e206)]:
  - openapi-fetch@0.10.6

## 0.0.3

### Patch Changes

- Updated dependencies [[`7698546`](https://github.com/openapi-ts/openapi-typescript/commit/76985467402dc52d705902c21159387ddaff3519)]:
  - openapi-fetch@0.10.5

## 0.0.2

### Patch Changes

- Updated dependencies [[`bcc9222`](https://github.com/openapi-ts/openapi-typescript/commit/bcc92223c83ba074316e17534a173fee8da9cd41)]:
  - openapi-typescript-helpers@0.0.11
  - openapi-fetch@0.10.4

## 0.0.1

### Patch Changes

- [#1717](https://github.com/openapi-ts/openapi-typescript/pull/1717) [`335530c`](https://github.com/openapi-ts/openapi-typescript/commit/335530c4f8f966d0154f19504585c462f5f5a409) Thanks [@kerwanp](https://github.com/kerwanp)! - Initial release

- Updated dependencies [[`335530c`](https://github.com/openapi-ts/openapi-typescript/commit/335530c4f8f966d0154f19504585c462f5f5a409), [`335530c`](https://github.com/openapi-ts/openapi-typescript/commit/335530c4f8f966d0154f19504585c462f5f5a409)]:
  - openapi-fetch@0.10.3
  - openapi-typescript-helpers@0.0.10
