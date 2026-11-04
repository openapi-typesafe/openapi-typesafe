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

## Fixed on `rc1/integrate`

Generator, by default (the output did not compile):

| Issue or cause | Change |
| --- | --- |
| #1665 | `oneOf` + discriminator parent whose members `allOf` it: no TS2502 (ADR-024) |
| #1752 | `--path-params-as-types`: the overlap check reads `operations[…]` and `components[…]` |
| own discriminator property declared twice | TS2300 / TS2687 / TS2717 |
| `--enum`: one member in two declarations of one name | TS2300 |
| schema `Record` under `--root-types-no-schema-prefix` | shadowed the global `Record` (TS2315) |
| `--enum-values`: unquoted name in `Extract<…>` | syntax error |
| `--enum-values`: path item parameters indexed twice | TS2339 |
| `$ref` into schema keywords (`items`, `allOf/0`, `content/…/schema`) | TS2339 |
| `--enum-values`: same array name twice | numbered `_2` |

Generator, opt-in `fix` names (ADR-021):

| Name | Issues |
| --- | --- |
| `allof-discriminated-union` | #1464, #1690 |
| `discriminator-member-required` | #2162 |
| `discriminator-values` (extended) | #2200, #2124, #1700 |
| `exploded-query-objects` | #2361 |
| `prefix-items` | #1892 |
| `read-write-refs` | #1938 |
| `nullable-enums` | #1872 |
| `dedupe-enum-names` | #1683 |
| `anyof-oneof-descriptions` | #2142 |

Clients (ADR-025): #2234, #1847 at runtime; #2464, #2267, #2178, #2458 and #2459, #2562, #2526,
#1862, #1882 in types. Checked and kept: `useInfiniteQuery` pages and `useMutation` data stay
`undefined` for an empty body, as upstream; only plain query data is `null`, which TanStack needs.

## Still open

Output that does not compile, scan of 1820 documents × 28 option sets (default: 24 → 16 cases):

| Cause | Documents | Plan |
| --- | --- | --- |
| TS2502: a recursive `JSONValue` array in an interface property | ~11 | TypeScript limit, documented; a footer alias would be an opt-in fix |
| `$ref` to keywords the output has no type for (`definitions`, `parameters/N/schema`) | ~9 | inline the resolved target |
| optional or nullable parent of a `$ref` (`WithRequired<… \| undefined>`) | ~5 | needs a fix name: `NonNullable` everywhere would change compiling output |
| `--enum-values` leftovers (`allOf` with two enums, array and non-array union, `FlattenedDeepRequired` limits) | ~27 | opt-in fix of the helper |
| `anyOf` of `required`-only variants next to `properties` gives `{…} \| unknown` | 22 (GitHub) | opt-in fix: types are lost even where the output compiles |
| discriminator value that the property's `enum` does not allow | several | invalid schema (Discriminator Object): typed warning |
| `--path-params-as-types`: paths that differ only by parameter names (TS2374) | 11 | invalid schema (Paths Object): typed warning |
| `--path-params-as-types`: a URL two templates match gets both types | 28 | TypeScript has no string type without `/` (microsoft/TypeScript#41160); documented |

Clients for 2.0: excess keys in `params` / `body` (#1525, #1769, #2329); hook `error` type
without network and middleware errors (#2151, #2372).

Not checked yet: #2128, #2189, #2855, #1647, #2672, #2815, #2862, #2005, #1947, #2034, #2655,
#2851, #2425, #2240, #2259, #2558. #1905 partly checked.

Classified fixed, not a bug, feature or unclear: see the session report; not repeated here.
