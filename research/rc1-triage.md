# Bug hunt before 1.0.0-rc.1

> Started 2026-11-04 after 1.0.0-rc.0. Upstream open issues that no file of this repository named
> (107 of 178 bug, security and TypeScript 7 items of `backlog.json`) were reproduced on `main`
> (19c5d85b and later) with a minimal schema or client, ours next to openapi-typescript 7.13.
> Case files were kept in the session scratchpad only.

## Fixed during the hunt

| Change | Pull request |
| --- | --- |
| Relative `$ref`s of an inline source resolve in `cwd` (ADR-023) | #6 |
| CLI paths are read as paths, not URLs (`#`, `?`, `%`, `C:\`) | #8 |
| Unknown negated flag is named as written | #8 |

## Generator: still reproduced

| Issue | Kind | Plan |
| --- | --- | --- |
| #1665 | invalid TypeScript (TS2502): `oneOf` + discriminator parent, members `allOf` the parent | default fix |
| #1752 | invalid TypeScript (TS2413): nested paths with `--path-params-as-types` | default fix |
| #1464, #1690 | wrong types: `Omit<Union, "discriminator">` drops the discriminator | `fix` name (ADR-021) |
| #2200 | wrong types: mapping values lost depending on schema order (`inheritFromRef`) | `fix` name |
| #2162 | wrong types: `WithRequired` lost when a discriminator is present | `fix` name |
| #2124 | duplicate discriminator constituent when the member declares it | `fix` name |
| #2361 | exploded object query parameter wrapped under its own name | `fix` name + fetch serializer |
| #1892 | `prefixItems` with `items` gives a closed tuple | `fix` name |
| #1938 | `readOnly` behind a `$ref` is not applied | `fix` name |
| #1700 | `--enum`: subtype enums (`CatPetType`) not assignable to the parent enum | `fix` name |
| #1872 | `--enum`: nullable 3.1 enum gives no TS enum | `fix` name |
| #1683 | `--dedupe-enums`: shared enum name changes when a schema is added | `fix` name |
| #2142 | JSDoc of `anyOf` / `oneOf` members dropped | `fix` name |

Not checked yet (disk full): #2128, #2189, #2855, #1647, #2672, #2815, #2862, #2005, #1947, #2034,
#2655, #2851, #2425, #2240, #2259, #2558. #1905 partly checked.

## Clients: still reproduced

| Issue | Package | Kind | Plan |
| --- | --- | --- | --- |
| #2234 | react-query | runtime: empty chunked 2xx or HEAD gives `undefined`, TanStack rejects it | default fix |
| #1847 | fetch | runtime: `instanceof Request/Response` rejects another realm or undici copy | default fix |
| #2464 | react-query | 204 gives `null` at runtime, typed `undefined` | type fix |
| #2267 | react-query | `Paths extends Record<…>` rejects the generated `interface paths` | type fix |
| #2178 | react-query | `Parameters<typeof queryOptions>` has `path: never` | type fix |
| #2458, #2459 | react-query | `useInfiniteQuery` page param typed `unknown` | type fix |
| #2562 | fetch | undici `fetch` / `Request` options rejected by types | type fix |
| #2526 | fetch | `createClient<any>()` requires an init argument | type fix |
| #1862 | fetch | only a `default` response: `data` is `never` | type fix |
| #1882 | fetch | large `paths` (~400): TS2589 and no path completion | type fix |
| #1525, #1769, #2329 | fetch | excess keys in `params` / `body` pass | stricter types: 2.0 (ADR-022 pattern) |
| #2151, #2372 | react-query | hook `error` type omits network and middleware errors | stricter types: 2.0 |

Classified fixed, not a bug, feature or unclear: see the session report; not repeated here.
