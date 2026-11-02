# Libraries that consume the generated `paths` format (research task 3.4)

Measured on 2026-11-02. "Weekly downloads" is the week 2026-10-23 … 2026-10-29 from
`api.npmjs.org/downloads/point/last-week`. "Last release" is the registry `modified` date of the latest
version. "Relies on" comes from reading the published `.d.ts` / source of the latest version through jsDelivr
(imports from `openapi-typescript-helpers` / `openapi-fetch` / `openapi-typescript`, and property access on
the generated types).

For scale: `openapi-typescript` 14.1M, `openapi-fetch` 15.5M, `openapi-typescript-helpers` 15.3M weekly
downloads in the same week.

## Libraries

| Library (npm) | Version | Weekly downloads | Last release | Relies on | Ranges on our packages |
|---|---|---:|---|---|---|
| [`openapi-react-query`](https://github.com/openapi-ts/openapi-typescript/tree/main/packages/openapi-react-query) | 0.5.4 | 724,004 | 2026-02-11 | `openapi-fetch`: `Client`, `FetchResponse`, `MaybeOptionalInit`; helpers: `HttpMethod`, `MediaType`, `PathsWithMethod`, `RequiredKeysOf` | peer `openapi-fetch ^0.17.0`; dep `openapi-typescript-helpers ^0.1.0` |
| [`openapi-msw`](https://github.com/christoph-fricke/openapi-msw) | 2.1.1 | 304,593 | 2026-10-27 | No import from us. Own types walk `paths[path][method]` → `parameters.path` / `parameters.query`, `requestBody.content`, `responses[status].content`; treats `content?: never` as "no content" | none (peer `msw ^2.10.5 \|\| ^3.0.0`; dev `openapi-typescript ^7.13.0`) |
| [`openapi-typescript-fetch`](https://github.com/ajaishankar/openapi-typescript-fetch) | 2.2.1 | 81,834 | 2025-06-26 | No import from us. Own `OpenapiPaths<Paths>`: `parameters`, `requestBody.content["application/json"]`, `responses` with **numeric** keys `200`/`201`/`204` and `"default"` | none |
| [`swr-openapi`](https://github.com/htunnicliff/swr-openapi) | 5.6.0 | 53,759 | 2026-01-12 | Same as `openapi-react-query`: `Client`, `FetchResponse`, `MaybeOptionalInit`; `HttpMethod`, `MediaType`, `PathsWithMethod`, `RequiredKeysOf` | peer `openapi-fetch >=0.15`, **peer `openapi-typescript 7`**, `swr 2`; dep `openapi-typescript-helpers ^0.0.15` |
| [`@openapi-qraft/react`](https://github.com/OpenAPI-Qraft/openapi-qraft) + `@openapi-qraft/cli` | 2.14.1 | 30,589 / 28,102 | 2026-05-26 | The CLI runs our generator through `@openapi-qraft/openapi-typescript-plugin` (28,375/week; dep `openapi-typescript ^7.10.1`; uses `openapiTS`, `astToString`, a `transform` returning `TransformObject`). Generated services reference `paths[...][method]["parameters"]["query" \| "header" \| "path"]`, `requestBody`, `responses`, `content`, and `components["schemas"]` | dep `openapi-typescript ^7.10.1` (plugin) |
| [`nuxt-open-fetch`](https://github.com/Norbiros/nuxt-open-fetch) | 0.13.9 | 20,056 | 2026-03-12 | Runs `openapiTS` + `astToString` and forwards user `openAPITS` options (including callbacks). Types: `paths`; helpers `ErrorResponse`, `MediaType`, `OkStatus`, `OperationRequestBodyContent`, `ResponseContent`, `ResponseObjectMap`, `SuccessResponse`; types `OpenAPI3`, `OpenAPITSOptions` | dep `openapi-typescript ^7.10.1`, `openapi-typescript-helpers ^0.0.15` |
| [`@web-bee-ru/openapi-axios`](https://github.com/web-bee-ru/openapi-axios) | 0.0.7 | 15,990 | 2025-11-11 | Helpers `ErrorStatus`, `FilterKeys`, `OkStatus`, `PathsWithMethod` | dep `openapi-typescript-helpers ^0.0.12` (old) |
| [`@shopware/api-gen`](https://github.com/shopware/frontends/tree/main/packages/api-gen) | 1.5.3 | 8,528 | 2026-10-06 | Runs our generator (`transform` with `ctx` re-entry into `transformSchemaObjectWithComposition`), then post-processes the string | dep `openapi-typescript 7.13.0` (exact) |
| [`openapi-ts-router`](https://github.com/builder-group/community) | 0.4.1 | 6,411 | 2026-07-20 | Server-side (Hono / Express) router typed from `paths`. Helpers `FilterKeys`, `HttpMethod`, `IsOperationRequestBodyOptional`, `MediaType`, `OperationRequestBodyContent`, `PathsWithMethod`, `Readable`, `RequiredKeysOf`, `ResponseObjectMap`, `SuccessResponse`, `Writable` | dep `openapi-typescript-helpers ^0.1.0`; peer `hono ^4.12.21` |
| [`feature-fetch`](https://github.com/builder-group/community) | 0.1.2 | 4,234 | 2026-07-26 | Fetch client; same helper set as `openapi-fetch` (`ErrorResponse`, `FilterKeys`, `HttpMethod`, `IsOperationRequestBodyOptional`, `MediaType`, `OperationRequestBodyContent`, `PathsWithMethod`, `Readable`, `RequiredKeysOf`, `ResponseObjectMap`, `SuccessResponse`, `Writable`) | dep `openapi-typescript-helpers ^0.1.0` |
| [`@grafana/openapi-to-k6`](https://github.com/grafana/openapi-to-k6) | 0.4.1 | 4,791 | 2026-07-21 | Uses the generator as a library | dep `openapi-typescript ^7.4.1` |
| [`@koyori-app/openapi-vue-query`](https://github.com/koyori-app/openapi-vue-query) | 0.1.4 | 875 | 2026-06-22 | TanStack Vue Query wrapper over `openapi-fetch` (`openapi-react-query` port) | peer `openapi-fetch ^0.17.0`, `openapi-typescript-helpers ^0.1.0` |
| [`openapi-vue-query`](https://github.com/hirotaka/openapi-typescript-vue) | 0.0.5 | 191 | 2025-10-10 | Same shape as `openapi-react-query` | peer `openapi-fetch ^0.14.0`; dep `openapi-typescript-helpers ^0.0.15` |

Checked and **not** consumers of our format: `hono-openapi` (generates OpenAPI from Hono routes),
`fets` (infers from an OpenAPI JSON document), `@hey-api/openapi-ts` and `orval` (own generators),
`openapi-react-query-codegen` (uses `@hey-api/openapi-ts`), `openapi-axios` (own Redocly-based generator),
`openapi-typescript-axios` (abandoned, 2022). No package named `openapi-hono` exists on npm.

### Smaller consumers found through the npm dependents scan

From the 480 npm packages whose latest manifest lists one of our three packages (see
[dependents.csv](./dependents.csv)), these are libraries (not SDKs for one API) that consume the format:

| Library (npm) | Version | Weekly downloads | Last release | Relies on | Ranges on our packages |
|---|---|---:|---|---|---|
| [`nuxt-api-party`](https://github.com/johannschopplich/nuxt-api-party) | 4.0.1 | 7,876 | 2026-09-09 | Helpers `ErrorResponse`, `MediaType`, `ResponseObjectMap`; types `OpenAPI3`, `OpenAPITSOptions` | peer `openapi-typescript ^7`; dep `openapi-typescript-helpers 0.1.0` (exact) |
| [`fetch-frog`](https://github.com/bendingthemrules/fetch-frog) | 0.1.0 | 1,247 | 2026-08-27 | Runs `openapiTS` + `astToString`; helpers `ErrorResponse`, `FilterKeys`, `MediaType`, `OperationRequestBodyContent`, `ResponseObjectMap`, `SuccessResponse` | dep `openapi-typescript ^7.13.0`, `openapi-typescript-helpers ^0.0.7` (very old) |
| [`chowbea-axios`](https://github.com/ToniChowBea/chowbea-axios) | 3.0.1 | 241 | 2026-10-15 | Runs `openapiTS` + `astToString` and **forwards user `postTransform` / `transformProperty` hooks**; reads `operations` | dep `openapi-typescript ^7.13.0`, `openapi-typescript-helpers ^0.1.0` |
| [`@prover-coder-ai/openapi-effect`](https://github.com/ProverCoderAI/openapi-effect) | 1.0.27 | 183 | 2026-06-19 | openapi-fetch-compatible client returning Effect values; helpers `FilterKeys`, `HttpMethod`, `IsOperationRequestBodyOptional`, `OperationRequestBodyContent`, `PathsWithMethod`, `RequiredKeysOf`, `Writable` | dep `openapi-typescript-helpers ^0.1.0` |
| [`openapi-ts-server`](https://github.com/ssssota/openapi-ts-server) | 0.1.1 | 102 | 2025-07-28 | Server routing from `paths`; helpers `HttpMethod`, `PathsWithMethod` | dep `openapi-typescript-helpers ^0.0.15` |
| [`@moznion/openapi-fetch-gen`](https://github.com/moznion/openapi-fetch-gen) | 0.5.0 | 23 | 2025-08-26 | Generates a client by parsing the generated `.d.ts` file (per its package description) | peer `openapi-fetch >=0.13.5` |

The rest of the 41 packages that depend on `openapi-typescript-helpers` or peer-depend on `openapi-fetch`
are SDKs for a single API, forks of `openapi-fetch` (`openapi-fetch-otel-fix`, `openapi-fetch-tauri`,
`@robolex/openapi-fetch-core`), or have fewer than 100 weekly downloads.

## What the consumers rely on

### 1. The `openapi-typescript-helpers` type names (the biggest surface)

Every `openapi-fetch`-family library imports helper types by name. The union of names used by the
libraries above:

`HttpMethod`, `MediaType`, `PathsWithMethod`, `RequiredKeysOf`, `FilterKeys`, `OkStatus`, `ErrorStatus`,
`ResponseObjectMap`, `ResponseContent`, `SuccessResponse`, `ErrorResponse`, `OperationRequestBodyContent`,
`IsOperationRequestBodyOptional`, `Readable`, `Writable`.

Plus from `openapi-fetch`: `Client`, `FetchResponse`, `MaybeOptionalInit`.

Many ranges are in use at the same time: `^0.0.4`, `^0.0.7`, `^0.0.12`, `^0.0.15` (older libraries) and
`^0.1.0` / `0.1.0` (current). For `0.0.x`, a caret range matches only that exact version, so each library pins
one exact release. Our helpers package
must keep the same names and semantics in both lines, or the old wrappers will see two incompatible copies
of the helpers.

### 2. The structure of `paths` and `operations`

All consumers (with or without our helpers) index the generated types the same way:

```ts
paths[Path][Method]                     // Method in "get" | "put" | "post" | "delete" | "options" | "head" | "patch" | "trace"
  .parameters.{query, header, path, cookie}
  .requestBody.content[MediaType]
  .responses[Status].content[MediaType]
  .responses[Status].headers
components["schemas"][Name]
```

## Output shape guarantees our generator must keep

These are the guarantees the libraries above depend on. Each one should get a type-level test in the
compatibility harness (Phase 2) that compiles a small consumer snippet against the generated output.

1. **Top-level exports keep their names and kinds:** `export interface paths`, `export type webhooks`,
   `export interface components`, `export type $defs`, `export interface operations` (and `export type`
   variants under `--export-type`). Qraft and workleap's tool treat `paths`, `webhooks`, `components`,
   `$defs`, `operations` as reserved names.
2. **Every path item lists all eight methods.** Present methods are required properties
   (`get: operations["x"]` or an inline object). Absent methods are **optional and `never`**
   (`put?: never`). `PathsWithMethod` checks `Paths[P] extends { [K in Method]: any }`, so an absent method
   must stay optional, and a present one must stay required.
3. **`parameters` always exists** on path items and operations, with the four keys `query`, `header`,
   `path`, `cookie`; unused ones are `?: never`. Required groups (e.g. a path with path params) are not
   optional. openapi-fetch's `MaybeOptionalInit` and openapi-msw's `PathParams` / `QueryParams` read these.
4. **`requestBody`**: `requestBody?: never` when there is none; `requestBody: { content: { [media]: T } }`
   when required; `requestBody?: { ... }` when optional. `IsOperationRequestBodyOptional` and
   openapi-msw's `RequestMap` depend on that optional marker.
5. **`responses` keys:** numeric literal keys for concrete status codes (`200`, not `"200"`), string keys for
   ranges (`"2XX"`, `"4XX"`, `"5XX"`) and `default`. `OkStatus` / `ErrorStatus` and
   openapi-typescript-fetch's `200 extends keyof T` checks depend on the numeric form.
6. **Each response has `headers` and `content`.** "No content" is `content?: never` (openapi-msw converts
   exactly this pattern to `null`). `headers` has the `[name: string]: unknown` index signature.
7. **Media-type keys are the literal media type strings** (`"application/json"`, `"text/plain"`, …), so
   `MediaType = \`${string}/${string}\`` and `JSONLike` (`${string}/json`) keep matching.
8. **`$Read<T>` / `$Write<T>` markers** (under `--read-write-markers`) keep the structure
   `{ readonly $read: T }` / `{ readonly $write: T }`, because `Readable` / `Writable` in the helpers match
   on it.
9. **`components` keeps its sub-keys** (`schemas`, `responses`, `parameters`, `requestBodies`, `headers`,
   `pathItems`) and references stay as indexed access (`components["schemas"]["Pet"]`), not inlined copies.
   Qraft generates code that names these paths.
10. **Node API return value:** `openapiTS()` output must still be printable with `astToString()`
    (nuxt-open-fetch, Qraft, `@shopware/api-gen`, `@grafana/openapi-to-k6`); see
    [node-api-usage.md](./node-api-usage.md).
11. **Package names and ranges.** Several libraries declare `openapi-typescript` (`7`, `^7.10.1`, `^7.4.1`)
    or `openapi-fetch` (`^0.17.0`, `>=0.15`, `^0.14.0`) as peers or dependencies. Users of a renamed package
    get a peer warning or a duplicate install. The drop-in path therefore needs either compatible-name
    aliases (`npm:openapi-typesafe@…` with a matching version line) or documented overrides; this belongs in
    the migration guide and ADR-007.

Anything outside these points (comment text, property order, blank lines, `readonly` placement) can change
without breaking the libraries above, but it changes the bytes of every user's output, so it is still a
documented change under the compatibility harness rules.
