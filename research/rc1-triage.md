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

Also fixed by default after the first full-corpus check (ADR-026, ADR-027):

| Cause | Change |
| --- | --- |
| `$ref` to keywords the output has no type for (`definitions`, `parameters/N/schema`) | resolved target type |
| optional or nullable parent of a `$ref` (`WithRequired<… \| undefined>`) | declared properties read first |
| `--enum-values` arrays whose location type does not hold their values | typed by their values |
| `--path-params-as-types`: covered path items that overlap (TS2413) | proven assignable or split |

New opt-in `fix` names: `ref-pointers` (the `$ref` pointer type where the old output compiled) and
`anyof-oneof-required` (22 GitHub documents, `{…} | unknown`).

New typed warnings: `DISCRIMINATOR_VALUE_NOT_ALLOWED` (a discriminator value that the property
`enum` does not allow, an invalid Discriminator Object), `ENUM_VALUES_EXCLUDED` (an `allOf` of
enums that excludes listed values), `PATH_TEMPLATES_IDENTICAL` (paths that differ only by parameter
names; with `--path-params-as-types` they now compile).

The full corpus (1820 documents × 28 option sets) against 1.0.0-rc.0: no output changed without
`fix`, and no case has more TypeScript errors than before.

## Still open

| Cause | Plan |
| --- | --- |
| TS2502: a recursive `JSONValue` array in an interface property | documented (docs/advanced.md); the clean fix changes output shape, 2.0 |
| `--path-params-as-types`: a URL that two templates match gets both types | TypeScript has no string type without `/` (microsoft/TypeScript#41160); documented |

Clients for 2.0: excess keys in `params` / `body` (#1525, #1769, #2329); hook `error` type
without network and middleware errors (#2151, #2372).

## Second round

| Issue | Verdict |
| --- | --- |
| #1905 | bug: no schema and stdin a terminal waited silently; now `CLI_INPUT_MISSING` |
| #2189 | bug: problems in `.redocly.lint-ignore.yaml` still failed the run; now skipped |
| #2034 | docs: the query key holds the whole `init`, not `params` |
| #1947, #2655 | docs: `QueryClientProvider` setup and the "No QueryClient set" error |
| #2005 | fixed already (per-request `middleware`); its order is now documented |
| #2128, #2672, #2851, #2862 | fixed already |
| #2855 | not a bug: redundant parentheses, the same type; output kept for parity |
| #1647, #2425 | not a bug of the generator (user cast; a removed URL in the user's document) |
| #2815 | not a bug here: attw and the TypeScript 7 type matrix resolve the types |
| #2240, #2259, #2558 | not this project (swr-openapi, hey-api) |

Classified fixed, not a bug, feature or unclear: see the session report; not repeated here.

## Code audit

Five reviewers read the rc.1 code with repro schemas, upstream 7.13 next to it and `tsc --strict`.
Each finding was fixed with a test that failed first; a second, independent review of the fixes
found three more (marked "review").

| Area | Findings | Notes |
| --- | --- | --- |
| Clients | 4 | `Parameters<typeof client.request>`, union paths and methods, `placeholderData` of `useInfiniteQuery`, a `Request` without `headers` |
| CommonJS declarations | 1 | `.d.cts` of fetch and react-query; the type matrix has a `commonjs` project now |
| Discriminators | 11 + 1 review | ADR-024; the review case: a mapped parent left `never` under `discriminator-values` |
| Enums and `$ref` pointers | 8 + 1 review | ADR-026, ADR-027; the review case: a pointer past a value typed `unknown` |
| Paths and CLI | 7 + 1 review | ADR-028; the review case: `boolean` against `true \| false` was read as a rejection |

Path template overlaps were also checked on random documents against upstream (1200, then 900
with boolean enums): no output differs where upstream's compiles, and none of ours has errors
beyond TS1337, which upstream has too.

The full checks after the fixes found three more:

| Check | Finding | Fix |
| --- | --- | --- |
| Corpus run | `--path-params-as-types` took 258 s on Microsoft Graph beta (11 s upstream); rc.0 had the same pairwise check | a template is compared only with the paths that start with its first text |
| Corpus gate | Conjur: a template rc.0 moved out stayed in (TS2413) | the overlap check reads `T[number]` of an array |
| 22 dependents | swr-openapi: TS2344 and a widened literal (TS2322), both from changes after rc.0 | `PathsWithMethod` is upstream's type in a union; `MaybeOptionalInit` drops `infer` (ADR-025) |
