# openapi-typesafe-fetch

This package is a fork of `openapi-fetch`. Entries below are the upstream history up to the fork point (upstream commit `d46a319a`); versions in them are `openapi-fetch` versions.

## 1.0.0-rc.3

### Patch Changes

- Updated dependencies []:
  - openapi-typesafe-helpers@1.0.0-rc.3

## 1.0.0-rc.2

### Major Changes

- [#18](https://github.com/openapi-typesafe/openapi-typesafe/pull/18) [`bfd3e60`](https://github.com/openapi-typesafe/openapi-typesafe/commit/bfd3e605bdbe240d7a8a327a59d8924781016fbd) Thanks [@fedorello](https://github.com/fedorello)! - First stable release of openapi-typesafe-fetch, the successor of openapi-fetch 0.17 with the same
  API: change the import from `openapi-fetch`. A library that imports `openapi-fetch` itself, such as
  swr-openapi, needs it aliased to this package
  ([how](https://openapi-typesafe.github.io/openapi-typesafe/fetch/#libraries-built-on-openapi-fetch)). From 1.0 the package follows semver.

  Changes that can need work when you move from openapi-fetch 0.17:
  - `engines.node` is `>=22` (server code; browsers are not affected).
  - `Blob`, `File`, `ArrayBuffer`, typed array and `URLSearchParams` bodies are sent as they are; they
    were JSON-encoded to `{}`.
  - An object body with `Content-Type: multipart/form-data` is sent as `FormData`, not JSON.
  - A string body with a non-JSON `Content-Type` is sent as is, without JSON quotes (upstream
    [#2555](https://github.com/openapi-ts/openapi-typescript/issues/2555), [#2382](https://github.com/openapi-ts/openapi-typescript/issues/2382)).
  - A nested object in a form or multipart body throws; write a `bodySerializer` for it.
  - Query parameter names and object keys are percent-encoded like values (`[ ] $ : @ ,` stay).
  - A path parameter that makes a `.` or `..` segment, or a path that starts with `//`, rejects
    before `fetch` is called (upstream [#2483](https://github.com/openapi-ts/openapi-typescript/issues/2483)).
  - A path that already has a query string gets `&` before `params.query`, not a second `?`.
  - `defaultBodySerializer` declares its real return type instead of `string`; check
    `typeof result === "string"` where you used the result as a string.
  - `HttpMethod` includes `"query"`: a hand-written `Record<HttpMethod, …>` needs a `query` entry.

### Patch Changes

- [#15](https://github.com/openapi-typesafe/openapi-typesafe/pull/15) [`5837bac`](https://github.com/openapi-typesafe/openapi-typesafe/commit/5837baca3bbcd58bd132622d9a4723e97bc5a9bc) Thanks [@fedorello](https://github.com/fedorello)! - A form body with `; charset=UTF-8` is sent as a form, and its `null` fields are left out.

- [#15](https://github.com/openapi-typesafe/openapi-typesafe/pull/15) [`5837bac`](https://github.com/openapi-typesafe/openapi-typesafe/commit/5837baca3bbcd58bd132622d9a4723e97bc5a9bc) Thanks [@fedorello](https://github.com/fedorello)! - Headers given as a list of pairs (`[["x-t", "1"]]`) work.

- [#16](https://github.com/openapi-typesafe/openapi-typesafe/pull/16) [`cd79dbd`](https://github.com/openapi-typesafe/openapi-typesafe/commit/cd79dbd39d33dc913ec101a4c46560dff801da4e) Thanks [@fedorello](https://github.com/fedorello)! - Path values with `$'`, `` $` ``, `$&` or `$$` are sent as written.
- Updated dependencies [[`cd79dbd`](https://github.com/openapi-typesafe/openapi-typesafe/commit/cd79dbd39d33dc913ec101a4c46560dff801da4e), [`bfd3e60`](https://github.com/openapi-typesafe/openapi-typesafe/commit/bfd3e605bdbe240d7a8a327a59d8924781016fbd)]:
  - openapi-typesafe-helpers@1.0.0-rc.2

## 1.0.0-rc.1

### Patch Changes

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - `createClient<any>()` no longer requires an init argument: `client.GET("/users/me")` compiles.
  `RequestBodyOption<any>` was `{ body?: never } | { body: any }`, so `body` counted as required
  (upstream [#2526](https://github.com/openapi-typesafe/openapi-typesafe/issues/2526)). It is now `{ body?: any }`.

- [#11](https://github.com/openapi-typesafe/openapi-typesafe/pull/11) [`578bd5d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/578bd5df6e6937cc3a8870a78ff84bfa6837f0b7) Thanks [@fedorello](https://github.com/fedorello)! - The CommonJS declarations (`dist/index.d.cts`) now say what `require()` returns, as in
  openapi-fetch and openapi-react-query they did not. For the fetch client it is
  `{ default, ...named }`: `import createClient = require("openapi-typesafe-fetch")` type-checked
  and then failed at runtime with "createClient is not a function"; use `.default` or a default
  import. For the react-query client it is `createClient` itself; the exported types next to its
  `export =` were an error (TS2309) with `skipLibCheck: false`, and are now in a namespace merged with
  the function, so `import type { QueryKey } from "openapi-typesafe-react-query"` still works. Default
  imports and ES modules do not change.

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - An operation that declares no 2XX response types `data` with its `default` response, which covers
  every undeclared status, successes too. `data` was `never` (upstream [#1862](https://github.com/openapi-typesafe/openapi-typesafe/issues/1862)). `SuccessResponse`
  follows the same rule. With a 2XX response declared, `default` still types only `error`.

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - Middleware may return a `Request` or `Response` from the `undici` package, from another realm (an
  iframe, an Electron host) or of a custom `Request` class. They are recognized by their members, not
  by `instanceof`, which rejected them with "onRequest: must return new Request()" (upstream [#1847](https://github.com/openapi-typesafe/openapi-typesafe/issues/1847)):
  a `Request` by its `method`, `url` and `headers`, a `Response` by its `status` and `headers`.
  `Headers` from the `undici` package passed as `headers` are no longer dropped.

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - With a schema of hundreds of paths, a call with a wrong path reports the path and the editor
  completes paths on TypeScript 5.4 to 6.0. It gave "Type instantiation is excessively deep and
  possibly infinite" (TS2589) and no completion (upstream [#1882](https://github.com/openapi-typesafe/openapi-typesafe/issues/1882)): the init type of all operations
  of the method was one deep type, and is now computed per operation. The type matrix checks this
  with the GitHub schema on every supported TypeScript version.

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

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - `createClient` and `createPathBasedClient` accept `fetch` and `Request` of another Fetch API
  implementation, such as the `undici` package (upstream [#2562](https://github.com/openapi-typesafe/openapi-typesafe/issues/2562)). Their types are not the DOM lib's,
  so an overload with `OtherFetchClientOptions` checks only that `fetch` returns a promise and
  `Request` is a class. An inline `fetch` still gets a typed `Request` input.
- Updated dependencies [[`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01), [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01)]:
  - openapi-typesafe-helpers@1.0.0-rc.1

## 1.0.0-rc.0

### Minor Changes

- [`551c058`](https://github.com/openapi-typesafe/openapi-typesafe/commit/551c05889d32eaf1d328111e5c4d167e0337e5a4) Thanks [@fedorello](https://github.com/fedorello)! - The OpenAPI 3.2 `QUERY` method: `HttpMethod` includes `"query"`, the fetch client has
  `client.QUERY(url, { body })` (also through `request("query", …)` and the path-based client), and
  the react-query hooks accept `"query"`. A `Record<HttpMethod, …>` written by hand needs a `query`
  entry. The path-based client maps only HTTP method keys, so `parameters` no longer shows up as a
  `PARAMETERS()` call that always failed.

### Patch Changes

- [`16f572f`](https://github.com/openapi-typesafe/openapi-typesafe/commit/16f572fd582fbabe058abad2604ffb3299ddc97a) Thanks [@fedorello](https://github.com/fedorello)! - `defaultBodySerializer` recognizes headers from another JavaScript realm (an iframe, `node:vm`, Jest VM modules), so an `application/x-www-form-urlencoded` body is no longer sent as JSON there. Its type now declares the optional `headers` parameter. Fixes upstream [#2637](https://github.com/openapi-typesafe/openapi-typesafe/issues/2637).

- [`2b3671f`](https://github.com/openapi-typesafe/openapi-typesafe/commit/2b3671f126f78e24ead7ad785a55b79540ae9092) Thanks [@fedorello](https://github.com/fedorello)! - Middleware request ids come from a process-wide counter instead of `Math.random()`. Next.js prerendering rejected the random value as a side effect before uncached data. Ids stay unique, also across clients that share a middleware. Fixes upstream [#2486](https://github.com/openapi-typesafe/openapi-typesafe/issues/2486) (as [#2763](https://github.com/openapi-typesafe/openapi-typesafe/issues/2763) proposed).

- [`e49344a`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e49344a208fb3bb38cd86f62c1395f8f7ca950f6) Thanks [@fedorello](https://github.com/fedorello)! - Packages contain only their build output, sources for source maps, the CLI, and the README, license and changelog. Coverage reports, local logs and tool configs are no longer packed.

- [`b775891`](https://github.com/openapi-typesafe/openapi-typesafe/commit/b775891e2ac748aeab4cb3106c1df44a0b7ddf30) Thanks [@kaigritun](https://github.com/kaigritun)! - fix(openapi-typesafe-fetch): handle empty error responses when Content-Length header is stripped

- [`bb9d754`](https://github.com/openapi-typesafe/openapi-typesafe/commit/bb9d754cbb4133ac1ae09f1a340af455f9482ecc) Thanks [@fedorello](https://github.com/fedorello)! - The error for an invalid middleware has a missing backtick back: "Middleware must be an object
  with one of `onRequest()`, `onResponse()` or `onError()`".

- [`4091466`](https://github.com/openapi-typesafe/openapi-typesafe/commit/40914664dd3d9aba10c2720a78d226ba9355e5ba) Thanks [@fedorello](https://github.com/fedorello)! - An object body with `Content-Type: multipart/form-data` is now sent as `FormData`: one part per
  field, a `Blob` or `File` as a file part, an array as one part per item. Before, it was
  JSON-encoded, so every file upload needed its own `bodySerializer`. A `Content-Type` without a
  `boundary` set by hand for a `FormData` body is dropped, so the platform sets the boundary and the
  server can read the parts (openapi-typescript#1214). A nested object in such a body throws and
  names `bodySerializer()`. See ADR-013, decision 10.

- [`3786df3`](https://github.com/openapi-typesafe/openapi-typesafe/commit/3786df3482727d6b728b7409ebc9ee8b66f3b97c) Thanks [@fedorello](https://github.com/fedorello)! - Query parameter names and object keys are now percent-encoded, like values. A key from your data,
  such as the keys of an `additionalProperties` query object, could add a parameter (`a&admin`) or a
  path segment (`a/b`). `[`, `]`, `$`, `:`, `@` and `,` stay as written, so `filter[status]` and
  `$filter` are unchanged. See ADR-013, decision 9.

- [`77e1425`](https://github.com/openapi-typesafe/openapi-typesafe/commit/77e1425ac5b45833f2a69e12448056292f71803f) Thanks [@fedorello](https://github.com/fedorello)! - Request bodies that `fetch` sends as they are now go out unchanged, without a JSON `Content-Type`:
  `Blob`, `File`, `URLSearchParams`, `ArrayBuffer` and typed arrays. Before, they were JSON-encoded to
  `{}`, so a binary upload lost its data. A nested object in an `application/x-www-form-urlencoded`
  body now throws instead of being sent as `[object Object]`, and a path that already has a query
  string gets `&` instead of a second `?`. See ADR-013, decisions 6 to 8.

- [`4ddbce1`](https://github.com/openapi-typesafe/openapi-typesafe/commit/4ddbce1079976752abb426e79d27a744f9fe1cb3) Thanks [@fedorello](https://github.com/fedorello)! - `defaultPathSerializer` throws when a path parameter makes a `.` or `..` path segment, so a value like `..` can no longer move a request to another endpoint (path traversal). Such a request now rejects before `fetch` is called (ADR-013). Fixes upstream [#2483](https://github.com/openapi-typesafe/openapi-typesafe/issues/2483).

- [`f8ac0d6`](https://github.com/openapi-typesafe/openapi-typesafe/commit/f8ac0d6e8f35d317ccb41758b7a2f3dc1ecf1f87) Thanks [@fedorello](https://github.com/fedorello)! - A string request body is sent as is when the request sets a non-JSON `Content-Type` such as `text/plain`; before, it was JSON-encoded and got extra quotes. With a JSON `Content-Type`, or none, a string is still sent as a JSON string value (ADR-013). Fixes upstream [#2555](https://github.com/openapi-typesafe/openapi-typesafe/issues/2555), [#2382](https://github.com/openapi-typesafe/openapi-typesafe/issues/2382).
- Updated dependencies [[`e49344a`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e49344a208fb3bb38cd86f62c1395f8f7ca950f6), [`551c058`](https://github.com/openapi-typesafe/openapi-typesafe/commit/551c05889d32eaf1d328111e5c4d167e0337e5a4), [`63275f8`](https://github.com/openapi-typesafe/openapi-typesafe/commit/63275f86ff7ba855338f09f87fb9567c8ed91300), [`d5dcbb3`](https://github.com/openapi-typesafe/openapi-typesafe/commit/d5dcbb3f38e4d583334977c50db92461085d4a11)]:
  - openapi-typesafe-helpers@1.0.0-rc.0

## 0.17.0

### Minor Changes

- [#2549](https://github.com/openapi-ts/openapi-typescript/pull/2549) [`a690e52`](https://github.com/openapi-ts/openapi-typescript/commit/a690e526b7693479bc2f2f002d71a020fa5e4e16) Thanks [@abumalick](https://github.com/abumalick)! - Add readOnly/writeOnly support via `--read-write-markers` flag. When enabled, readOnly properties are wrapped with `$Read<T>` and writeOnly properties with `$Write<T>`. openapi-fetch uses `Readable<T>` and `Writable<T>` helpers to exclude these properties from responses and request bodies respectively.

### Patch Changes

- [#2572](https://github.com/openapi-ts/openapi-typescript/pull/2572) [`9350ddf`](https://github.com/openapi-ts/openapi-typescript/commit/9350ddfcd44b661a5288667ebfcf298868dd9784) Thanks [@luis-guideti](https://github.com/luis-guideti)! - Do not treat Content-Length=0 as empty when Transfer-Encoding is chunked

- Updated dependencies [[`a690e52`](https://github.com/openapi-ts/openapi-typescript/commit/a690e526b7693479bc2f2f002d71a020fa5e4e16)]:
  - openapi-typescript-helpers@0.1.0

## 0.16.0

### Minor Changes

- [#2362](https://github.com/openapi-ts/openapi-typescript/pull/2362) [`9002418`](https://github.com/openapi-ts/openapi-typescript/commit/90024185c7a251b5dbedd148e4eb5d15b95409c8) Thanks [@luxass](https://github.com/luxass)! - Added support for setting a custom path serializers either globally or per request. This allows you to customize how path parameters are serialized in the URL. E.g. you can use a custom serializer to prevent encoding of a path parameter, if you need to pass a value that should not be encoded.

## 0.15.2

### Patch Changes

- [#2508](https://github.com/openapi-ts/openapi-typescript/pull/2508) [`89843b0`](https://github.com/openapi-ts/openapi-typescript/commit/89843b06296ac1b227cc27546009e79b3a749aaa) Thanks [@srbarba](https://github.com/srbarba)! - Use text() when no content-length is provided to avoid errors parsing empty bodies (200 with no content)

## 0.15.1

### Patch Changes

- [#2556](https://github.com/openapi-ts/openapi-typescript/pull/2556) [`36c0fb8`](https://github.com/openapi-ts/openapi-typescript/commit/36c0fb8a0504b27284843daaa9f49f80e2cfad0d) Thanks [@justAnArthur](https://github.com/justAnArthur)! - fix omit serializing for already serialized data

## 0.15.0

### Minor Changes

- [#2465](https://github.com/openapi-ts/openapi-typescript/pull/2465) [`8f96eb5`](https://github.com/openapi-ts/openapi-typescript/commit/8f96eb50f5ec060e2e9100e9a43d3fe98e9795c5) Thanks [@Kauabunga](https://github.com/Kauabunga)! - Enable request level middlewares option

## 0.14.1

### Patch Changes

- [#2407](https://github.com/openapi-ts/openapi-typescript/pull/2407) [`7527d1e`](https://github.com/openapi-ts/openapi-typescript/commit/7527d1e7502cd1e9621922f028b4736d85f25800) Thanks [@jthacker](https://github.com/jthacker)! - Fix Request parameter being ignored by client methods

## 0.14.0

### Minor Changes

- [#2310](https://github.com/openapi-ts/openapi-typescript/pull/2310) [`e66b5ce`](https://github.com/openapi-ts/openapi-typescript/commit/e66b5ce63bfcdc57c6ee942e5ed4e7667e64c290) Thanks [@drwpow](https://github.com/drwpow)! - Build package with unbuild. Also remove the minified version (openapi-fetch is only useful in a TypeScript/bundler environment, so there’s no sense in loading it from a CDN clientside).

## 0.13.8

### Patch Changes

- [#2096](https://github.com/openapi-ts/openapi-typescript/pull/2096) [`0058128`](https://github.com/openapi-ts/openapi-typescript/commit/0058128afa258180793ae2071022d89a688d8ddc) Thanks [@obulat](https://github.com/obulat)! - Encode the request body if `Content-Type` header is `x-www-form-urlencoded`
- [#2157](https://github.com/openapi-ts/openapi-typescript/pull/2157) [`419d9ac`](https://github.com/openapi-ts/openapi-typescript/commit/419d9ac6851cf780b81060ddc05c231c5225a17b) Thanks [@Rendez](https://github.com/Rendez)! - Fix overriding baseUrl per request without overriding default baseUrl
- [#2308](https://github.com/openapi-ts/openapi-typescript/pull/2308) [`81c031d`](https://github.com/openapi-ts/openapi-typescript/commit/81c031da8584ed49b033ebfc67bbb3e1ca258699) Thanks [@drwpow](https://github.com/drwpow)! - Improve header handling

## 0.13.7

### Patch Changes

- [#2256](https://github.com/openapi-ts/openapi-typescript/pull/2256) [`30c6da8`](https://github.com/openapi-ts/openapi-typescript/commit/30c6da800a00bda87da66dea6d04807e1379f06a) Thanks [@KajSzy](https://github.com/KajSzy)! - fix dynamic access to methods using wrapAsPathBasedClient

## 0.13.6

### Patch Changes

- [#2205](https://github.com/openapi-ts/openapi-typescript/pull/2205) [`4966560`](https://github.com/openapi-ts/openapi-typescript/commit/4966560790ad49fabb06d718115a82a779a5b74a) Thanks [@live-small](https://github.com/live-small)! - Fix HEAD method requests to prevent body parsing regardless of Content-Length header value

## 0.13.5

### Patch Changes

- [#2091](https://github.com/openapi-ts/openapi-typescript/pull/2091) [`ebe56f3`](https://github.com/openapi-ts/openapi-typescript/commit/ebe56f337561bfdd1bf1abdc56ba3d2f48c4d393) Thanks [@p-dubovitsky](https://github.com/p-dubovitsky)! - Allow returning Response from onRequest callback

## 0.13.4

### Patch Changes

- [#2063](https://github.com/openapi-ts/openapi-typescript/pull/2063) [`5935cd2`](https://github.com/openapi-ts/openapi-typescript/commit/5935cd25a05d3ec1f4c8bf222d65395a0b9ae5b4) Thanks [@kerwanp](https://github.com/kerwanp)! - add support for arbitrary method

## 0.13.3

### Patch Changes

Refresh of 0.13.2; corrupted package

## 0.13.2

### Patch Changes

- [#2020](https://github.com/openapi-ts/openapi-typescript/pull/2020) [`7081842`](https://github.com/openapi-ts/openapi-typescript/commit/70818420c1cd6ca2ad2529bf2d7936bd01f3ef42) Thanks [@mellster2012](https://github.com/mellster2012)! - Add client option to pass custom RequestInit object into fetch requests for supported implementations

## 0.13.1

### Patch Changes

- [#1974](https://github.com/openapi-ts/openapi-typescript/pull/1974) [`35c576c`](https://github.com/openapi-ts/openapi-typescript/commit/35c576c8b2852f66e641014d13ffcfdeb21e98a1) Thanks [@luchsamapparat](https://github.com/luchsamapparat)! - add onError handler to middleware

## 0.13.0

### Minor Changes

- [#1968](https://github.com/openapi-ts/openapi-typescript/pull/1968) [`267977e`](https://github.com/openapi-ts/openapi-typescript/commit/267977e369f7a84c5d828023e6175729e4dd4c22) Thanks [@DjordyKoert](https://github.com/DjordyKoert)! - 204 responses or response with a Content-Length of 0 will now return undefined instead of an empty object

## 0.12.5

### Patch Changes

- [#1937](https://github.com/openapi-ts/openapi-typescript/pull/1937) [`06163a2`](https://github.com/openapi-ts/openapi-typescript/commit/06163a2030eaf8d0579f624d86481e1205aef396) Thanks [@DjordyKoert](https://github.com/DjordyKoert)! - client data & error now return a union of possible types

- Updated dependencies [[`06163a2`](https://github.com/openapi-ts/openapi-typescript/commit/06163a2030eaf8d0579f624d86481e1205aef396)]:
  - openapi-typescript-helpers@0.0.15

## 0.12.4

### Patch Changes

- Updated dependencies [[`abfad56`](https://github.com/openapi-ts/openapi-typescript/commit/abfad5659183f95f705598dc52ae2dfe7a18ec04)]:
  - openapi-typescript-helpers@0.0.14

## 0.12.3

### Patch Changes

- [#1936](https://github.com/openapi-ts/openapi-typescript/pull/1936) [`d14aa65`](https://github.com/openapi-ts/openapi-typescript/commit/d14aa65207b8abd1f369965bbd32ebb581e8d741) Thanks [@BlakeSzabo](https://github.com/BlakeSzabo)! - Fix multiple empty arrays in query params appending extra ampersands

## 0.12.2

### Patch Changes

- [#1918](https://github.com/openapi-ts/openapi-typescript/pull/1918) [`e39d11e`](https://github.com/openapi-ts/openapi-typescript/commit/e39d11e5ac4e7f5fc2ce81e8a6d7792f91a6551a) Thanks [@yicrotkd](https://github.com/yicrotkd)! - Improve `Middleware` type definition to require either onRequest or onResponse

## 0.12.1

### Patch Changes

- [#1907](https://github.com/openapi-ts/openapi-typescript/pull/1907) [`efaa1e2`](https://github.com/openapi-ts/openapi-typescript/commit/efaa1e23b9cb0901fe026e48fbb4b347f0c95507) Thanks [@tobiasdcl](https://github.com/tobiasdcl)! - allow usage of custom Request class

## 0.12.0

### Minor Changes

- ⚠️ **Breaking Change** [#1826](https://github.com/openapi-ts/openapi-typescript/pull/1826) [`b893c44`](https://github.com/openapi-ts/openapi-typescript/commit/b893c44f4290917f24c2ef7cda106c540df9cb3d) Thanks [@goce-cz](https://github.com/goce-cz)! - Do not set content-type on body-less requests

## 0.11.3

### Patch Changes

- [#1825](https://github.com/openapi-ts/openapi-typescript/pull/1825) [`6038f8f`](https://github.com/openapi-ts/openapi-typescript/commit/6038f8fca09fa698c9dd9bc49349c49342c46ac2) Thanks [@goce-cz](https://github.com/goce-cz)! - Allow falsy values (except undefined) as a valid body

## 0.11.2

### Patch Changes

- [#1817](https://github.com/openapi-ts/openapi-typescript/pull/1817) [`2a4b067`](https://github.com/openapi-ts/openapi-typescript/commit/2a4b067f43f7e0b75aecbf5c2fb3013a4e96e591) Thanks [@Gruak](https://github.com/Gruak)! - Allow specifying baseUrl per request

- [#1842](https://github.com/openapi-ts/openapi-typescript/pull/1842) [`0e42cbb`](https://github.com/openapi-ts/openapi-typescript/commit/0e42cbb98e2a023c33685de65ab0b8dbf82cc4b3) Thanks [@gzm0](https://github.com/gzm0)! - fix: allow use of `PathBasedClient` with generated `paths`

## 0.11.1

### Patch Changes

- [#1831](https://github.com/openapi-ts/openapi-typescript/pull/1831) [`091e71a`](https://github.com/openapi-ts/openapi-typescript/commit/091e71ad4bf805be32261a53524f320c2fa42690) Thanks [@SebastienGllmt](https://github.com/SebastienGllmt)! - Add MethodResponse utility type to easily get the return type of an endpoint on a client

- [#1833](https://github.com/openapi-ts/openapi-typescript/pull/1833) [`cec023d`](https://github.com/openapi-ts/openapi-typescript/commit/cec023d3461c79ca355a88366949d0f6382e4e2a) Thanks [@ngraef](https://github.com/ngraef)! - Fix identification of required properties when `strictNullChecks` is disabled

- Updated dependencies [[`cec023d`](https://github.com/openapi-ts/openapi-typescript/commit/cec023d3461c79ca355a88366949d0f6382e4e2a)]:
  - openapi-typescript-helpers@0.0.12

## 0.11.0

### Minor Changes

-- ⚠️ **Breaking Change** [#1791](https://github.com/openapi-ts/openapi-typescript/pull/1791) [`a956d5d`](https://github.com/openapi-ts/openapi-typescript/commit/a956d5d8480834402536283ee2f24ce8086698dc) Thanks [@gzm0](https://github.com/gzm0)! - Add support for `client["/endpoint"].GET()` style calls

## 0.10.6

### Patch Changes

- [#1809](https://github.com/openapi-ts/openapi-typescript/pull/1809) [`f21c05b`](https://github.com/openapi-ts/openapi-typescript/commit/f21c05b9afcc89ee6ef73edab4045620b410eb01) Thanks [@gzm0](https://github.com/gzm0)! - perf: remove unnecessary `async` keywords (for reduced code size)

- [#1827](https://github.com/openapi-ts/openapi-typescript/pull/1827) [`ba0d595`](https://github.com/openapi-ts/openapi-typescript/commit/ba0d595556661053b5ef310afafec4fcc116e206) Thanks [@ngraef](https://github.com/ngraef)! - Fix typing for environments without DOM lib

## 0.10.5

### Patch Changes

- [#1762](https://github.com/openapi-ts/openapi-typescript/pull/1762) [`7698546`](https://github.com/openapi-ts/openapi-typescript/commit/76985467402dc52d705902c21159387ddaff3519) Thanks [@thatsprettyfaroutman](https://github.com/thatsprettyfaroutman)! - Allow FormData through defaultBodySerializer

## 0.10.4

### Patch Changes

- Updated dependencies [[`bcc9222`](https://github.com/openapi-ts/openapi-typescript/commit/bcc92223c83ba074316e17534a173fee8da9cd41)]:
  - openapi-typescript-helpers@0.0.11

## 0.10.3

### Patch Changes

- [#1717](https://github.com/openapi-ts/openapi-typescript/pull/1717) [`335530c`](https://github.com/openapi-ts/openapi-typescript/commit/335530c4f8f966d0154f19504585c462f5f5a409) Thanks [@kerwanp](https://github.com/kerwanp)! - Ignore configuration files in published package

- [#1717](https://github.com/openapi-ts/openapi-typescript/pull/1717) [`335530c`](https://github.com/openapi-ts/openapi-typescript/commit/335530c4f8f966d0154f19504585c462f5f5a409) Thanks [@kerwanp](https://github.com/kerwanp)! - Create own client type for easier reusability

- Updated dependencies [[`335530c`](https://github.com/openapi-ts/openapi-typescript/commit/335530c4f8f966d0154f19504585c462f5f5a409)]:
  - openapi-typescript-helpers@0.0.10

## 0.10.2

### Patch Changes

- [#1696](https://github.com/openapi-ts/openapi-typescript/pull/1696) [`aea31a8`](https://github.com/openapi-ts/openapi-typescript/commit/aea31a8679b901745a98f856fea9d53dff6807b3) Thanks [@swachter](https://github.com/swachter)! - Fix: encode primitive path parameters

## 0.10.1

### Patch Changes

- [#1719](https://github.com/openapi-ts/openapi-typescript/pull/1719) [`a8f2253`](https://github.com/openapi-ts/openapi-typescript/commit/a8f2253d31f060f66fe8c5c69ae79b1f81e78587) Thanks [@drwpow](https://github.com/drwpow)! - Remove nanoid from dependencies

- [#1719](https://github.com/openapi-ts/openapi-typescript/pull/1719) [`a8f2253`](https://github.com/openapi-ts/openapi-typescript/commit/a8f2253d31f060f66fe8c5c69ae79b1f81e78587) Thanks [@drwpow](https://github.com/drwpow)! - Fix "failed to execute fetch on Window" error

- [#1719](https://github.com/openapi-ts/openapi-typescript/pull/1719) [`a8f2253`](https://github.com/openapi-ts/openapi-typescript/commit/a8f2253d31f060f66fe8c5c69ae79b1f81e78587) Thanks [@drwpow](https://github.com/drwpow)! - Revert customFetch API back to `fetch(input: Request)`

## 0.10.0

### Minor Changes

- ⚠️ **Breaking Change**: `openapi-typescript@7` is needed to work. You’ll get type errors with `openapi-typescript@6` and below.
- ⚠️ **Breaking Change**: The Middleware API has changed to be an object rather than `(request, options)` or `(response, options)`. [See Middleware docs](https://openapi-ts.dev/openapi-fetch/middleware-auth) for updated API.
- ⚠️ **Breaking Change**: The `Content-Type` header is no longer sent by default if a body payload is attached.
- ⚠️ **Breaking Change**: The `customFetch` type now calls `fetch(input: string, init: RequestInit)` and the types have been updated, rather than `fetch(input: Request)` introduced in `0.9.0`.

- Added `id` to middleware handlers that create a unique ID per-fetch

## 0.9.8

### Patch Changes

- [#1697](https://github.com/openapi-ts/openapi-typescript/pull/1697) [`e77ce50`](https://github.com/openapi-ts/openapi-typescript/commit/e77ce501e479f54fb783c19b99fa7a53a894732c) Thanks [@armandabric](https://github.com/armandabric)! - Expose original request on Middleware.onResponse

## 0.9.7

### Patch Changes

- [#1672](https://github.com/openapi-ts/openapi-typescript/pull/1672) [`64cb619`](https://github.com/openapi-ts/openapi-typescript/commit/64cb6193ddd94523636fd55ba308117f2614a2e2) Thanks [@jaredLunde](https://github.com/jaredLunde)! - Fixes issue where native properties were not excluded from custom properties in the CustomRequest class

## 0.9.6

### Patch Changes

- [#1653](https://github.com/openapi-ts/openapi-typescript/pull/1653) [`4f4253a`](https://github.com/openapi-ts/openapi-typescript/commit/4f4253a031820a664499b9df7ed5c8b192aa98b3) Thanks [@FreeAoi](https://github.com/FreeAoi)! - Let request object have custom properties

## 0.9.5

### Patch Changes

- [#1639](https://github.com/openapi-ts/openapi-typescript/pull/1639) [`645f436`](https://github.com/openapi-ts/openapi-typescript/commit/645f4366d2907b05eee1e6ec33d13edab8614fa1) Thanks [@FreeAoi](https://github.com/FreeAoi)! - fix request option types don't showing optional props correctly

## 0.9.4

### Patch Changes

- [#1597](https://github.com/openapi-ts/openapi-typescript/pull/1597) [`1f7ad9d`](https://github.com/openapi-ts/openapi-typescript/commit/1f7ad9d41f1f1ca7b1195a381c907393f9ef743b) Thanks [@armandabric](https://github.com/armandabric)! - Allow to select the response content type

- [#1585](https://github.com/openapi-ts/openapi-typescript/pull/1585) [`4e06f86`](https://github.com/openapi-ts/openapi-typescript/commit/4e06f86934e11f3dbc3aabee4b4e61dd62680782) Thanks [@mikestopcontinues](https://github.com/mikestopcontinues)! - Update types for path-methods object

- [#1610](https://github.com/openapi-ts/openapi-typescript/pull/1610) [`cc8073b`](https://github.com/openapi-ts/openapi-typescript/commit/cc8073b3ee42e7aaa546a9c6a0553c300d8882de) Thanks [@illright](https://github.com/illright)! - Fix data/error discrimination when there are empty-body errors

- [#1587](https://github.com/openapi-ts/openapi-typescript/pull/1587) [`2a66a64`](https://github.com/openapi-ts/openapi-typescript/commit/2a66a6483d755a090e57a457b22eb99696da098a) Thanks [@JE-lee](https://github.com/JE-lee)! - Fix the custom fetch type

## 0.9.3

### Patch Changes

- [#1580](https://github.com/openapi-ts/openapi-typescript/pull/1580) [`4c0c7fc`](https://github.com/openapi-ts/openapi-typescript/commit/4c0c7fc69dc6416dcf1fea785455bce8b9742704) Thanks [@drwpow](https://github.com/drwpow)! - Fix type errors

## 0.9.2

### Patch Changes

- [#1550](https://github.com/openapi-ts/openapi-typescript/pull/1550) [`a5a9cc7`](https://github.com/openapi-ts/openapi-typescript/commit/a5a9cc766f893fd93500a5a1ff909746194bfdc7) Thanks [@shirish87](https://github.com/shirish87)! - Fix 'Content-Type' header being removed from requests with multipart/form-data body

## 0.9.1

### Patch Changes

- [#1546](https://github.com/openapi-ts/openapi-typescript/pull/1546) [`cc64453`](https://github.com/openapi-ts/openapi-typescript/commit/cc64453c7f92c77c19bc45dc0f701a98ab461b16) Thanks [@drwpow](https://github.com/drwpow)! - Fix JSON consuming body

## 0.9.0

### Minor Changes

- [#1521](https://github.com/openapi-ts/openapi-typescript/pull/1521) [`b174dd6`](https://github.com/openapi-ts/openapi-typescript/commit/b174dd6a7668e2f1f6bf6bd086ba2dabf7fb669e) Thanks [@drwpow](https://github.com/drwpow)! - Add middleware support

- [#1521](https://github.com/openapi-ts/openapi-typescript/pull/1521) [`fc3a468`](https://github.com/openapi-ts/openapi-typescript/commit/fc3a468c4342e17d203712be358b30a3fb82ab1e) Thanks [@drwpow](https://github.com/drwpow)! - ⚠️ Breaking change (internal): fetch() is now called with new Request() to support middleware (which may affect test mocking)

- [#1521](https://github.com/openapi-ts/openapi-typescript/pull/1521) [`2551e4b`](https://github.com/openapi-ts/openapi-typescript/commit/2551e4bde41d5437a76c13bb5ba25ede4f14db10) Thanks [@drwpow](https://github.com/drwpow)! - ⚠️ **Breaking change**: Responses are no longer automatically `.clone()`’d in certain instances. Be sure to `.clone()` yourself if you need to access the raw body!

- [#1534](https://github.com/openapi-ts/openapi-typescript/pull/1534) [`2bbeb92`](https://github.com/openapi-ts/openapi-typescript/commit/2bbeb92244cb82a534abb016ffb5fbd1255d9db5) Thanks [@drwpow](https://github.com/drwpow)! - ⚠️ Breaking change: no longer supports deeply-nested objects/arrays for query & path serialization.

### Patch Changes

- [#1484](https://github.com/openapi-ts/openapi-typescript/pull/1484) [`49bbd72`](https://github.com/openapi-ts/openapi-typescript/commit/49bbd72800f7bc6c460a741c50d11eb216746290) Thanks [@drwpow](https://github.com/drwpow)! - Remove prepare script

- [#1479](https://github.com/openapi-ts/openapi-typescript/pull/1479) [`c6d945b`](https://github.com/openapi-ts/openapi-typescript/commit/c6d945be717bb3999178fb3a77292e41e1b7ab80) Thanks [@darwish](https://github.com/darwish)! - Fixed build of openapi-typescript-helpers for CommonJS environments

- [#1534](https://github.com/openapi-ts/openapi-typescript/pull/1534) [`2bbeb92`](https://github.com/openapi-ts/openapi-typescript/commit/2bbeb92244cb82a534abb016ffb5fbd1255d9db5) Thanks [@drwpow](https://github.com/drwpow)! - Add support for automatic label & matrix path serialization.

- [#1521](https://github.com/openapi-ts/openapi-typescript/pull/1521) [`fd44bd2`](https://github.com/openapi-ts/openapi-typescript/commit/fd44bd28d881715e30f5a71435f05f6bae13859d) Thanks [@drwpow](https://github.com/drwpow)! - Support arrays in headers

- [#1534](https://github.com/openapi-ts/openapi-typescript/pull/1534) [`2bbeb92`](https://github.com/openapi-ts/openapi-typescript/commit/2bbeb92244cb82a534abb016ffb5fbd1255d9db5) Thanks [@drwpow](https://github.com/drwpow)! - Remove leading question marks from querySerializer

- [#1530](https://github.com/openapi-ts/openapi-typescript/pull/1530) [`4765658`](https://github.com/openapi-ts/openapi-typescript/commit/4765658460e0850d005e3f08cd63c4949326349b) Thanks [@wydengyre](https://github.com/wydengyre)! - Exports the ClientMethod utility type.

- Updated dependencies [[`c6d945b`](https://github.com/openapi-ts/openapi-typescript/commit/c6d945be717bb3999178fb3a77292e41e1b7ab80)]:
  - openapi-typescript-helpers@0.0.7

## 0.8.2

### Patch Changes

- [#1424](https://github.com/openapi-ts/openapi-typescript/pull/1424) [`8f5adb3`](https://github.com/openapi-ts/openapi-typescript/commit/8f5adb3700eacff287d8b3f62837cb823503d5a4) Thanks [@drwpow](https://github.com/drwpow)! - Separate TS types to be managed manually

- Updated dependencies [[`5be2082`](https://github.com/openapi-ts/openapi-typescript/commit/5be20827334c60e53222445561b9cfc526f4f6a9)]:
  - openapi-typescript-helpers@0.0.5

## 0.8.1

### Patch Changes

- [#1404](https://github.com/openapi-ts/openapi-typescript/pull/1404) [`93204e4`](https://github.com/openapi-ts/openapi-typescript/commit/93204e4de1b6e0469fdc8b710f5b279671570a9a) Thanks [@drwpow](https://github.com/drwpow)! - Fix behavior for empty arrays and objects in default `querySerializer`

## 0.8.0

### Minor Changes

- [#1399](https://github.com/openapi-ts/openapi-typescript/pull/1399) [`4fca1e4`](https://github.com/openapi-ts/openapi-typescript/commit/4fca1e477f524223fa8921559caef6bb364dc194) Thanks [@drwpow](https://github.com/drwpow)! - ⚠️ **Breaking**: change default querySerializer behavior to produce `style: form`, `explode: true` query params [according to the OpenAPI specification](https://swagger.io/docs/specification/serialization/#query). Also adds support for `deepObject`s (square bracket style).

## 0.7.10

### Patch Changes

- [#1373](https://github.com/openapi-ts/openapi-typescript/pull/1373) [`fd3e96f`](https://github.com/openapi-ts/openapi-typescript/commit/fd3e96fb2e68a0d58b326331264809e76ca89672) Thanks [@HugeLetters](https://github.com/HugeLetters)! - Added the option to provide custom fetch function to individual API calls.

## 0.7.9

### Patch Changes

- [#1366](https://github.com/openapi-ts/openapi-typescript/pull/1366) [`04dbd6d`](https://github.com/openapi-ts/openapi-typescript/commit/04dbd6d84fffd1d88300421bae25e946f1c303da) Thanks [@drwpow](https://github.com/drwpow)! - Fix empty object being required param

- Updated dependencies [[`04dbd6d`](https://github.com/openapi-ts/openapi-typescript/commit/04dbd6d84fffd1d88300421bae25e946f1c303da)]:
  - openapi-typescript-helpers@0.0.4

## 0.7.8

### Patch Changes

- [#1360](https://github.com/openapi-ts/openapi-typescript/pull/1360) [`b59e431`](https://github.com/openapi-ts/openapi-typescript/commit/b59e431d1876d1cc60dda5e9b59b6185b0136437) Thanks [@marcomuser](https://github.com/marcomuser)! - Fix CJS build for TypeScript

## 0.7.7

### Patch Changes

- Updated dependencies [[`996e51e`](https://github.com/openapi-ts/openapi-typescript/commit/996e51e9b475f4818af77301ed5c0ab458736cb9)]:
  - openapi-typescript-helpers@0.0.3

## 0.7.6

### Patch Changes

- [#1332](https://github.com/openapi-ts/openapi-typescript/pull/1332) [`8e8ebfd`](https://github.com/openapi-ts/openapi-typescript/commit/8e8ebfdcd84ff6a3d7b6f5d00695fc11366b436e) Thanks [@drwpow](https://github.com/drwpow)! - Restore original .d.ts module-resolution behavior

## 0.7.5

### Patch Changes

- Updated dependencies [[`e63a345`](https://github.com/openapi-ts/openapi-typescript/commit/e63a34561c8137c4cfdef858a2272be32960ca4f)]:
  - openapi-typescript-helpers@0.0.2

## 0.7.4

### Patch Changes

- [#1314](https://github.com/openapi-ts/openapi-typescript/pull/1314) [`181c4de`](https://github.com/openapi-ts/openapi-typescript/commit/181c4de395e9c337937f61d6dd5e0ba47954d893) Thanks [@drwpow](https://github.com/drwpow)! - Make headers typing friendlier

- [#1314](https://github.com/openapi-ts/openapi-typescript/pull/1314) [`181c4de`](https://github.com/openapi-ts/openapi-typescript/commit/181c4de395e9c337937f61d6dd5e0ba47954d893) Thanks [@drwpow](https://github.com/drwpow)! - Allow unsetting headers

## 0.7.3

### Patch Changes

- [#1300](https://github.com/openapi-ts/openapi-typescript/pull/1300) [`5939e20`](https://github.com/openapi-ts/openapi-typescript/commit/5939e20b86ca3019cbc0a1c7f6de2b15a806cf72) Thanks [@drwpow](https://github.com/drwpow)! - Use openapi-typescript-helpers package for types

## 0.7.2

### Patch Changes

- [#1242](https://github.com/openapi-ts/openapi-typescript/pull/1242) [`8d11701`](https://github.com/openapi-ts/openapi-typescript/commit/8d11701deb22d47bc8ef04b6210ea6722ecb461b) Thanks [@drwpow](https://github.com/drwpow)! - Fix impossible body typing

## 0.7.1

### Patch Changes

- [#1251](https://github.com/openapi-ts/openapi-typescript/pull/1251) [`80717a7`](https://github.com/openapi-ts/openapi-typescript/commit/80717a75ad20f2224a9a61d2a5b3d2b2bbd7c78b) Thanks [@drwpow](https://github.com/drwpow)! - Fix 2XX, 4XX, 5XX responses

## 0.7.0

### Minor Changes

- [#1243](https://github.com/openapi-ts/openapi-typescript/pull/1243) [`541abf4`](https://github.com/openapi-ts/openapi-typescript/commit/541abf4966cf6020de5e4bf4b93cfa9741ec9a00) Thanks [@drwpow](https://github.com/drwpow)! - ⚠️ Breaking: rename all methods to UPPERCASE (`GET()`, `POST()`, etc.)

## 0.6.2

### Patch Changes

- [#1239](https://github.com/openapi-ts/openapi-typescript/pull/1239) [`4c93067`](https://github.com/openapi-ts/openapi-typescript/commit/4c9306720daa65b1c1977030737a52121fd46668) Thanks [@drwpow](https://github.com/drwpow)! - Fix params.header inference

## 0.6.1

### Patch Changes

- [#1192](https://github.com/openapi-ts/openapi-typescript/pull/1192) [`38ee8b4`](https://github.com/openapi-ts/openapi-typescript/commit/38ee8b406ecf07e2dece05c4867a0bc5d27c309d) Thanks [@psychedelicious](https://github.com/psychedelicious)! - Fix header handling for FormData

## 0.6.0

### Minor Changes

- [`0380e9a`](https://github.com/openapi-ts/openapi-typescript/commit/0380e9a572f6edfcc6ca1242b7f11abd8fc24610) Thanks [@drwpow](https://github.com/drwpow)! - Add multipart/form-data request body support

- [`0380e9a`](https://github.com/openapi-ts/openapi-typescript/commit/0380e9a572f6edfcc6ca1242b7f11abd8fc24610) Thanks [@drwpow](https://github.com/drwpow)! - Breaking: openapi-fetch now just takes the first media type it finds rather than preferring JSON. This is because in the case of `multipart/form-data` vs `application/json`, it’s not inherently clear which you’d want. Or if there were multiple JSON-like media types.

## 0.5.0

### Minor Changes

- [#1183](https://github.com/openapi-ts/openapi-typescript/pull/1183) [`431a98f`](https://github.com/openapi-ts/openapi-typescript/commit/431a98f0b6d518aa8e780f063d680d380a8a12dd) Thanks [@psychedelicious](https://github.com/psychedelicious)! - Add global `querySerializer()` option to `createClient()`

### Patch Changes

- [#1186](https://github.com/openapi-ts/openapi-typescript/pull/1186) [`cd0a653`](https://github.com/openapi-ts/openapi-typescript/commit/cd0a65354b03fce8a6e28453b8760ac017205df1) Thanks [@drwpow](https://github.com/drwpow)! - Fix CJS build

## 0.4.0

### Minor Changes

- [#1176](https://github.com/openapi-ts/openapi-typescript/pull/1176) [`21fb484`](https://github.com/openapi-ts/openapi-typescript/pull/1176/commits/21fb4848f1e70e4423a5f20cae330210b5b813b4) Thanks [@kecrily](https://github.com/kecrily)! - Add CommonJS bundle

## 0.3.0

### Minor Changes

- [#1169](https://github.com/openapi-ts/openapi-typescript/pull/1169) [`74bfc0d`](https://github.com/openapi-ts/openapi-typescript/commit/74bfc0d879747790aed7942e11f4b277b9b0428d) Thanks [@drwpow](https://github.com/drwpow)! - Expose createFinalURL() logic for testing

- [#1169](https://github.com/openapi-ts/openapi-typescript/pull/1169) [`74bfc0d`](https://github.com/openapi-ts/openapi-typescript/commit/74bfc0d879747790aed7942e11f4b277b9b0428d) Thanks [@drwpow](https://github.com/drwpow)! - Automatically remove `undefined` and `null` query params without requiring querySerializer

- [#1169](https://github.com/openapi-ts/openapi-typescript/pull/1169) [`74bfc0d`](https://github.com/openapi-ts/openapi-typescript/commit/74bfc0d879747790aed7942e11f4b277b9b0428d) Thanks [@drwpow](https://github.com/drwpow)! - Allow overriding of JSON body parsing

### Patch Changes

- [#1169](https://github.com/openapi-ts/openapi-typescript/pull/1169) [`74bfc0d`](https://github.com/openapi-ts/openapi-typescript/commit/74bfc0d879747790aed7942e11f4b277b9b0428d) Thanks [@drwpow](https://github.com/drwpow)! - Clone response internally

- [#1169](https://github.com/openapi-ts/openapi-typescript/pull/1169) [`74bfc0d`](https://github.com/openapi-ts/openapi-typescript/commit/74bfc0d879747790aed7942e11f4b277b9b0428d) Thanks [@drwpow](https://github.com/drwpow)! - Strip trailing slashes from baseUrl

- [#1169](https://github.com/openapi-ts/openapi-typescript/pull/1169) [`74bfc0d`](https://github.com/openapi-ts/openapi-typescript/commit/74bfc0d879747790aed7942e11f4b277b9b0428d) Thanks [@drwpow](https://github.com/drwpow)! - Fix querySerializer typing

## 0.2.1

### Patch Changes

- [#1139](https://github.com/openapi-ts/openapi-typescript/pull/1139) [`30c01fa`](https://github.com/openapi-ts/openapi-typescript/commit/30c01fa3727a9696166a9bf44dd01693cc354a09) Thanks [@drwpow](https://github.com/drwpow)! - Treat `default` response as error

## 0.2.0

### Minor Changes

- 97c8757: Add custom fetch option (#51). Thanks, [@hd-o](https://github.com/hd-o)!

## 0.1.4

### Patch Changes

- 63ebe48: Fix request body type when optional (#48)

## 0.1.3

### Patch Changes

- 8c01480: Fix querySerializer signature

## 0.1.2

### Patch Changes

- e730cd8: Fix post() and options() types

## 0.1.1

### Patch Changes

- 5d1fb7d: Fix bad HTTP method lookup causing polymorphsim

## 0.1.0

### Minor Changes

- f878cd3: Add querySerializer

### Patch Changes

- 22197a1: Add missing type defs for minified build
- ff3174a: Fix type inference bugs
- 4ce3828: Skip parsing JSON for empty responses (#23)
- ff3ae1b: Skip parsing JSON for 204 responses (#28)

## 0.0.8

### Patch Changes

- 8e7cb46: Fix TypeScript lib error, simplify generated types

## 0.0.7

### Patch Changes

- fce1546: Support "application/json;charset=utf-8" content types (#15). Thanks, [@shinzui](https://github.com/shinzui)!
- 0899e0e: Add minified build (#18)

## 0.0.6

### Patch Changes

- 27c149c: Fix data, error sometimes returning undefined

## 0.0.5

### Patch Changes

- c818e65: Export BaseParams shared type (#8)

## 0.0.4

### Patch Changes

- ce99563: Fix optional requestBody in path

## 0.0.3

### Patch Changes

- b69cb51: Autocomplete URLs by path ([#2](https://github.com/drwpow/openapi-fetch/pull/2)). Thanks, [@mitchell-merry](https://github.com/mitchell-merry)!

## 0.0.2

### Patch Changes

- 5a47464: Fix module entry

## 0.0.1

### Patch Changes

- 55d7013: Encode path params
