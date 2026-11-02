# Upstream backlog (task 3.2)

> Export of all open issues and open pull requests of
> [openapi-ts/openapi-typescript](https://github.com/openapi-ts/openapi-typescript), ranked by reactions and
> labeled with our own categories. Input for Phase 7 (tasks 7.4 and 7.6).
> Raw data: [`backlog.json`](./backlog.json).

## 1. How the data was collected

**Date:** 2026-11-02. **Source:** GitHub GraphQL API through the authenticated `gh` CLI.

**Totals:** 287 open items — **210 open issues** and **77 open pull requests** (3 drafts; 57 mergeable,
20 with merge conflicts). 1,167 reactions in total. 34 open PRs declare that they close an open issue.

**Context.** On 2026-09-19 the upstream maintainer announced that the project is in maintenance mode and will get no
more updates, including security patches ([#2874](https://github.com/openapi-ts/openapi-typescript/issues/2874)).
The open release PR [#2616](https://github.com/openapi-ts/openapi-typescript/pull/2616) (openapi-typescript 7.14.0,
openapi-fetch 0.17.1, openapi-react-query 0.5.5) was never merged; its changesets are already on our fork base (§2 of
the engineering plan).

**Query** (run with `gh api graphql --paginate --slurp`; PRs were fetched 30 per page because 100 per page returned
HTTP 502):

```graphql
query($endCursor: String) {
  repository(owner: "openapi-ts", name: "openapi-typescript") {
    issues(states: OPEN, first: 100, after: $endCursor) {   # pullRequests(...) for PRs
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        number title url createdAt updatedAt bodyText
        labels(first: 20) { nodes { name } }
        reactions { totalCount }
        thumbs: reactions(content: THUMBS_UP) { totalCount }
        comments { totalCount }
        # PRs only:
        # isDraft mergeable files(first: 30) { nodes { path } }
        # closingIssuesReferences(first: 10) { nodes { number } }
      }
    }
  }
}
```

**Ranking.** By total reactions (all emoji kinds), then thumbs-up, then comment count, then issue number. The rank
is global over issues and PRs together. "Reactions" counts reactions on the issue or PR itself, not on comments.

**Classification.** Every item gets exactly one package and one category.

*Package* — the code that would have to change:

| Package | Rule |
|---|---|
| `generator` | Upstream label `openapi-ts`, or a PR that touches `packages/openapi-typescript` |
| `fetch` | Upstream label `openapi-fetch`, or a PR that touches only `packages/openapi-fetch` |
| `react-query` | Upstream label `openapi-react-query`, or a PR that touches `packages/openapi-react-query` |
| `helpers` | The fix lives in `openapi-typescript-helpers` (`Readable` / `Writable`, `SuccessResponseJSON`, `RequiredKeysOf`), whatever the upstream label |
| `docs` | Only documentation must change (wrong, missing or outdated docs) |
| `other` | Not one of our packages: `swr-openapi` (separate repo now), `openapi-metadata` (deprecated), requests for new packages (Axios, Solid, Pinia Colada, mocks), CI, repo chores, Dependabot, meta discussions |

Upstream labels win unless the title or body clearly points to another package. Overrides:
#1474 (`openapi-fetch` label, but the cause is `allOf` generation → generator); #1979 (`openapi-fetch` → react-query);
#2034, #2242 (package labels → docs); #2392, #2531, #2805 (`openapi-ts` label, but about client types → fetch);
#2492 (`openapi-ts` → react-query); #2615, #2620, #2717 (`openapi-fetch` → helpers).

*Category*:

| Category | Rule |
|---|---|
| `ts7` | TypeScript 6 / 7 / tsgo readiness: peer-dependency range, runtime dependency on the TS compiler API, module resolution under the native compiler, docs about TS 7 setup. TS 6 items are counted here because they sit on the same path (the peer range and the compiler API) |
| `security` | Vulnerable dependencies, a client-side security hardening request, security-related CI. Dependabot bumps are `security` only when their release notes name an advisory (#2810, #2811, #2821); the others are `meta` |
| `bug` | Upstream label `bug`, or the body describes wrong, invalid or crashing behavior, a regression, or a type hole |
| `feature` | Upstream label `enhancement`, or a request for new behavior, a new option or a new package |
| `meta` | Not a code change: project status, release PR, dependency dashboard, benchmarks, CI and lint config chores |

`ts7` and `security` win over `bug` / `feature`. For `docs` items, `bug` means the docs are wrong and `feature`
means docs are missing.

**Ambiguous cases** (decided as shown; listed so the reader can disagree):

- #1683 "Deduplicate enums" — labeled `bug`, reads like a feature request; kept as bug (output contains duplicates).
- #1738 "CLI option to validate existing file" — labeled both `bug` and `enhancement`; classified as feature.
- #1651, #1723 — labeled `question`; both describe broken behavior (CLI hang, lost error union) → bug.
- #1882 "Type instantiation is excessively deep" — labeled `enhancement`; it is a compile failure → bug.
- #2486 / #2763 `Math.random()` request ID — labeled `enhancement`; it breaks Next.js prerendering → bug.
- #2224 "Allow internal API requests" (relative URLs) — labeled `bug`, could be a feature; kept as bug.
- #2317 — labeled `bug`, asks for access to the response in `onError`; kept as bug.
- #2558 — about `@hey-api` Vue client, filed in the wrong repo; package `other`.
- #2672 "Unreleased version from main" — release management, not a code bug; kept as generator / bug
  because the fix (releasing) changes what users get. Already resolved on our fork base.
- #2815 (`exports.types` for tsgo) touches both generator and fetch; filed under generator.
- #2844 / #2853 HTTP `QUERY` method touch all packages; filed under fetch (the main user-visible change).
- #2483 path traversal with `..` in path params — a hardening request, not a CVE; classified as security.

## 2. Summary

### All items (issues + PRs)

| Package | bug | feature | ts7 | security | meta | Total |
|---|---:|---:|---:|---:|---:|---:|
| generator | 75 | 33 | 9 | 4 | 0 | 121 |
| fetch | 34 | 26 | 0 | 1 | 1 | 62 |
| react-query | 29 | 27 | 0 | 0 | 0 | 56 |
| helpers | 12 | 0 | 0 | 0 | 0 | 12 |
| docs | 6 | 6 | 1 | 0 | 0 | 13 |
| other | 3 | 8 | 0 | 4 | 8 | 23 |
| **Total** | **159** | **100** | **10** | **9** | **9** | **287** |

### Issues only

| Package | bug | feature | ts7 | security | meta | Total |
|---|---:|---:|---:|---:|---:|---:|
| generator | 58 | 23 | 3 | 3 | 0 | 87 |
| fetch | 29 | 22 | 0 | 1 | 1 | 53 |
| react-query | 21 | 21 | 0 | 0 | 0 | 42 |
| helpers | 6 | 0 | 0 | 0 | 0 | 6 |
| docs | 4 | 4 | 0 | 0 | 0 | 8 |
| other | 3 | 8 | 0 | 0 | 3 | 14 |
| **Total** | **121** | **78** | **3** | **4** | **4** | **210** |

### Pull requests only

| Package | bug | feature | ts7 | security | meta | Total |
|---|---:|---:|---:|---:|---:|---:|
| generator | 17 | 10 | 6 | 1 | 0 | 34 |
| fetch | 5 | 4 | 0 | 0 | 0 | 9 |
| react-query | 8 | 6 | 0 | 0 | 0 | 14 |
| helpers | 6 | 0 | 0 | 0 | 0 | 6 |
| docs | 2 | 2 | 1 | 0 | 0 | 5 |
| other | 0 | 0 | 0 | 4 | 5 | 9 |
| **Total** | **38** | **22** | **7** | **5** | **5** | **77** |

### Reactions by package

| Package | Items | Total reactions | Thumbs-up | Items with 0 reactions |
|---|---:|---:|---:|---:|
| generator | 121 | 638 | 542 | 62 |
| fetch | 62 | 154 | 121 | 21 |
| react-query | 56 | 173 | 155 | 17 |
| helpers | 12 | 29 | 24 | 4 |
| docs | 13 | 17 | 8 | 8 |
| other | 23 | 156 | 76 | 14 |
| **Total** | **287** | **1167** | **926** | **126** |

## 3. Top 40 by reactions

Ties are broken by thumbs-up, then by comment count, then by number.

| Rank | # | Type | Title | Package | Category | Reactions | Thumbs-up | Comments | Status |
|---:|---|---|---|---|---|---:|---:|---:|---|
| 1 | [#2723](https://github.com/openapi-ts/openapi-typescript/issues/2723) | issue | Add support for TypeScript 6 | generator | ts7 | 97 | 97 | 8 | open PR #2774 |
| 2 | [#2774](https://github.com/openapi-ts/openapi-typescript/pull/2774) | pr | feat: add TypeScript 6 support | generator | ts7 | 87 | 51 | 19 | ready, conflicts, closes #2723 |
| 3 | [#2874](https://github.com/openapi-ts/openapi-typescript/issues/2874) | issue | openapi-typescript in maintenance mode | other | meta | 78 | 8 | 5 |  |
| 4 | [#2841](https://github.com/openapi-ts/openapi-typescript/issues/2841) | issue | openapi-typescript doesn't work with Typescript 7 | generator | ts7 | 57 | 57 | 8 | open PR #2867, #2877 |
| 5 | [#2843](https://github.com/openapi-ts/openapi-typescript/issues/2843) | issue | Is this project still maintained? | other | meta | 50 | 50 | 2 |  |
| 6 | [#1214](https://github.com/openapi-ts/openapi-typescript/issues/1214) | issue | Support for File Upload | generator | feature | 48 | 48 | 22 | open PR #2878 |
| 7 | [#2550](https://github.com/openapi-ts/openapi-typescript/issues/2550) | issue | Not TS 6 compliant | generator | ts7 | 38 | 38 | 0 |  |
| 8 | [#2577](https://github.com/openapi-ts/openapi-typescript/issues/2577) | issue | Is there support for openapi 3.2? | generator | feature | 31 | 31 | 5 |  |
| 9 | [#941](https://github.com/openapi-ts/openapi-typescript/issues/941) | issue | [Feature request] Generate Enums AND Union types | generator | feature | 29 | 20 | 17 |  |
| 10 | [#1806](https://github.com/openapi-ts/openapi-typescript/issues/1806) | issue | openapi-react-query: Add easy way of invalidating queries | react-query | feature | 20 | 20 | 26 |  |
| 11 | [#2366](https://github.com/openapi-ts/openapi-typescript/issues/2366) | issue | Generate as const Enum-like Objects Alongside String Unions | generator | feature | 20 | 17 | 0 |  |
| 12 | [#2818](https://github.com/openapi-ts/openapi-typescript/pull/2818) | pr | feat: Typescript 6 support | generator | ts7 | 20 | 7 | 16 | ready, conflicts |
| 13 | [#1970](https://github.com/openapi-ts/openapi-typescript/pull/1970) | pr | feat: narrow type based on status code | fetch | feature | 19 | 0 | 11 | ready, conflicts |
| 14 | [#1723](https://github.com/openapi-ts/openapi-typescript/issues/1723) | issue | Union type for `error` disappears in typescript-fetch v0.10 | fetch | bug | 17 | 17 | 30 |  |
| 15 | [#2012](https://github.com/openapi-ts/openapi-typescript/issues/2012) | issue | Optional parameters with `default` are generated as required | generator | bug | 17 | 17 | 5 |  |
| 16 | [#922](https://github.com/openapi-ts/openapi-typescript/issues/922) | issue | Add support for security and securitySchemes | generator | feature | 16 | 16 | 12 |  |
| 17 | [#2615](https://github.com/openapi-ts/openapi-typescript/issues/2615) | issue | `Readable` in new openapi-typescript-helpers is broken | helpers | bug | 14 | 14 | 8 | open PR #2650 |
| 18 | [#2644](https://github.com/openapi-ts/openapi-typescript/issues/2644) | issue | Upgrade @redocly/openapi-core from 1.x to 2.x to resolve minimatch vulnerability (GHSA-3p… | generator | security | 14 | 14 | 4 |  |
| 19 | [#2257](https://github.com/openapi-ts/openapi-typescript/issues/2257) | issue | Ability to access response object in onError function | react-query | feature | 14 | 14 | 0 |  |
| 20 | [#2487](https://github.com/openapi-ts/openapi-typescript/pull/2487) | pr | Feat: add mutation options | react-query | feature | 12 | 12 | 9 | ready, closes #2485 |
| 21 | [#2127](https://github.com/openapi-ts/openapi-typescript/issues/2127) | issue | openapi-react-query: allow access to response headers | react-query | feature | 12 | 12 | 7 |  |
| 22 | [#1922](https://github.com/openapi-ts/openapi-typescript/issues/1922) | issue | Option to only generate code for specific tags/operations | generator | feature | 12 | 12 | 1 |  |
| 23 | [#2133](https://github.com/openapi-ts/openapi-typescript/issues/2133) | issue | Add support for Axios | other | feature | 12 | 5 | 1 |  |
| 24 | [#2373](https://github.com/openapi-ts/openapi-typescript/issues/2373) | issue | Support --type-mappings flag | generator | feature | 12 | 4 | 1 |  |
| 25 | [#1464](https://github.com/openapi-ts/openapi-typescript/issues/1464) | issue | Incorrect type generation when using a `$ref` with `discriminator` inside `allOf` | generator | bug | 10 | 10 | 9 |  |
| 26 | [#2383](https://github.com/openapi-ts/openapi-typescript/issues/2383) | issue | openapi-react-query: Accessing http status code | react-query | feature | 9 | 8 | 4 |  |
| 27 | [#2872](https://github.com/openapi-ts/openapi-typescript/pull/2872) | pr | Support TypeScript 6 and 7 without a runtime compiler dependency | generator | ts7 | 9 | 7 | 4 | ready, conflicts |
| 28 | [#1328](https://github.com/openapi-ts/openapi-typescript/issues/1328) | issue | run-time serialization and deserialization of custom formats | fetch | feature | 8 | 8 | 12 |  |
| 29 | [#2530](https://github.com/openapi-ts/openapi-typescript/issues/2530) | issue | When a server returns an error status code without content, the error is present but unde… | fetch | bug | 8 | 8 | 8 | open PR #2762 |
| 30 | [#2073](https://github.com/openapi-ts/openapi-typescript/issues/2073) | issue | Allow onRequest middleware to add headers that the schema requires | fetch | feature | 8 | 8 | 6 |  |
| 31 | [#2224](https://github.com/openapi-ts/openapi-typescript/issues/2224) | issue | Allow Internal API Requests | fetch | bug | 8 | 8 | 4 |  |
| 32 | [#2238](https://github.com/openapi-ts/openapi-typescript/issues/2238) | issue | Possibility to access the response status code for "not ok" responses. | react-query | feature | 8 | 8 | 3 |  |
| 33 | [#2343](https://github.com/openapi-ts/openapi-typescript/issues/2343) | issue | Error type incorrectly inferred | react-query | bug | 8 | 8 | 2 |  |
| 34 | [#2846](https://github.com/openapi-ts/openapi-typescript/issues/2846) | issue | Latest openapi-typescript pulls vulnerable js-yaml via archived @redocly/openapi-core 1.x | generator | security | 8 | 8 | 1 |  |
| 35 | [#2620](https://github.com/openapi-ts/openapi-typescript/issues/2620) | issue | `Readable` prevents type narrowing | helpers | bug | 8 | 8 | 0 | open PR #2650 |
| 36 | [#1700](https://github.com/openapi-ts/openapi-typescript/issues/1700) | issue | Discriminator mapping does not seem to work properly | generator | bug | 8 | 6 | 3 |  |
| 37 | [#1520](https://github.com/openapi-ts/openapi-typescript/issues/1520) | issue | Empty object inside of allOf creates Record<string, never> in a type intersection | generator | bug | 8 | 0 | 10 |  |
| 38 | [#2100](https://github.com/openapi-ts/openapi-typescript/issues/2100) | issue | Params are missing in mutationKey | react-query | bug | 7 | 7 | 4 |  |
| 39 | [#2367](https://github.com/openapi-ts/openapi-typescript/issues/2367) | issue | Wrapper for useSWRMutation | other | feature | 7 | 7 | 4 |  |
| 40 | [#2242](https://github.com/openapi-ts/openapi-typescript/issues/2242) | issue | Update docs and examples for Next.js | docs | feature | 7 | 4 | 0 |  |

## 4. Full ranked list (by package, then category)

Columns: global rank, link, type, title, reactions / thumbs-up, comments, status (for PRs: draft or ready, merge conflicts, linked issues; for issues: open PRs that close them).

### 4.1. generator

#### generator / bug (75)

| Rank | # | Type | Title | R / TU | Cm | Status |
|---:|---|---|---|---:|---:|---|
| 15 | [#2012](https://github.com/openapi-ts/openapi-typescript/issues/2012) | issue | Optional parameters with `default` are generated as required | 17 / 17 | 5 |  |
| 25 | [#1464](https://github.com/openapi-ts/openapi-typescript/issues/1464) | issue | Incorrect type generation when using a `$ref` with `discriminator` inside `allO… | 10 / 10 | 9 |  |
| 36 | [#1700](https://github.com/openapi-ts/openapi-typescript/issues/1700) | issue | Discriminator mapping does not seem to work properly | 8 / 6 | 3 |  |
| 37 | [#1520](https://github.com/openapi-ts/openapi-typescript/issues/1520) | issue | Empty object inside of allOf creates Record<string, never> in a type intersecti… | 8 / 0 | 10 |  |
| 47 | [#2099](https://github.com/openapi-ts/openapi-typescript/issues/2099) | issue | Type and Enum duplicated when schema property enum as $ref | 5 / 5 | 10 |  |
| 48 | [#1651](https://github.com/openapi-ts/openapi-typescript/issues/1651) | issue | `--properties-required-by-default` and `--default-non-nullable` flags do not wo… | 5 / 5 | 8 |  |
| 52 | [#2417](https://github.com/openapi-ts/openapi-typescript/issues/2417) | issue | The "requestBody" in generated api is always optional | 5 / 5 | 1 |  |
| 55 | [#1474](https://github.com/openapi-ts/openapi-typescript/issues/1474) | issue | allOff with required returning Record<string, never> | 4 / 4 | 14 | open PR #2850 |
| 56 | [#1683](https://github.com/openapi-ts/openapi-typescript/issues/1683) | issue | Deduplicate enums | 4 / 4 | 6 |  |
| 70 | [#2672](https://github.com/openapi-ts/openapi-typescript/issues/2672) | issue | Unreleased version from main branch | 3 / 3 | 4 |  |
| 71 | [#2380](https://github.com/openapi-ts/openapi-typescript/issues/2380) | issue | Incorrect typescript schema when using anyOf with properties | 3 / 3 | 3 | open PR #2608 |
| 74 | [#2361](https://github.com/openapi-ts/openapi-typescript/issues/2361) | issue | $ref objects in query params aren't spread onto type | 3 / 3 | 2 |  |
| 80 | [#2341](https://github.com/openapi-ts/openapi-typescript/issues/2341) | issue | Incorrect TypeScript generated when using true TS enums and top-level type expo… | 3 / 2 | 3 |  |
| 83 | [#2318](https://github.com/openapi-ts/openapi-typescript/issues/2318) | issue | Name of schema generated as type value when using oneOf | 3 / 2 | 0 |  |
| 88 | [#1872](https://github.com/openapi-ts/openapi-typescript/issues/1872) | issue | Enum generation: OpenAPI 3.1 null enum value doesn't generate enum | 3 / 0 | 1 |  |
| 91 | [#1957](https://github.com/openapi-ts/openapi-typescript/issues/1957) | issue | Inconsistent behavior for optional properties with defaults | 2 / 2 | 5 |  |
| 94 | [#2189](https://github.com/openapi-ts/openapi-typescript/issues/2189) | issue | .redocly.lint-ignore.yaml file not respected when generating types | 2 / 2 | 4 |  |
| 96 | [#2342](https://github.com/openapi-ts/openapi-typescript/issues/2342) | issue | cjs format error in openapi-typescript@7.8.0 | 2 / 2 | 3 |  |
| 98 | [#1903](https://github.com/openapi-ts/openapi-typescript/issues/1903) | issue | Schemas using $ref give different output to identical inlined spec when using d… | 2 / 2 | 2 |  |
| 102 | [#1856](https://github.com/openapi-ts/openapi-typescript/issues/1856) | issue | Array of Enum with --enum-values creates 2-D Type, but 1-D values | 2 / 2 | 1 |  |
| 105 | [#2523](https://github.com/openapi-ts/openapi-typescript/issues/2523) | issue | [CLI] Hangs when Options (-/-- flags) are out-of-order | 2 / 2 | 1 | open PR #2764 |
| 106 | [#2124](https://github.com/openapi-ts/openapi-typescript/issues/2124) | issue | Duplicate discriminator enum from createDiscriminatorEnum in 7.x | 2 / 2 | 0 |  |
| 115 | [#1938](https://github.com/openapi-ts/openapi-typescript/issues/1938) | issue | readOnly is not picked up from document if ref is used with enums | 2 / 0 | 4 |  |
| 120 | [#1752](https://github.com/openapi-ts/openapi-typescript/issues/1752) | issue | Generates invalid types when API paths are nested | 1 / 1 | 9 |  |
| 121 | [#2149](https://github.com/openapi-ts/openapi-typescript/issues/2149) | issue | Discriminator values are generated using the name of referenced types instead o… | 1 / 1 | 5 |  |
| 122 | [#2194](https://github.com/openapi-ts/openapi-typescript/issues/2194) | issue | Incorrect enum ApiPaths members when parametrized paths | 1 / 1 | 5 |  |
| 123 | [#2047](https://github.com/openapi-ts/openapi-typescript/issues/2047) | issue | Types aren't correctly exported for CJS | 1 / 1 | 4 |  |
| 124 | [#2048](https://github.com/openapi-ts/openapi-typescript/issues/2048) | issue | `--array-length` with `minItems: 1` generates empty array | 1 / 1 | 4 |  |
| 126 | [#2251](https://github.com/openapi-ts/openapi-typescript/issues/2251) | issue | Process crashes if the schemas has an object type with a key containing a % sign | 1 / 1 | 3 | open PR #2828 |
| 131 | [#2154](https://github.com/openapi-ts/openapi-typescript/issues/2154) | issue | Discriminated Union Not Typed Correctly | 1 / 1 | 2 |  |
| 139 | [#2369](https://github.com/openapi-ts/openapi-typescript/issues/2369) | issue | Optional route params not recognised | 1 / 1 | 1 |  |
| 140 | [#2418](https://github.com/openapi-ts/openapi-typescript/issues/2418) | issue | Any discriminator type is generated twice | 1 / 1 | 1 |  |
| 143 | [#2165](https://github.com/openapi-ts/openapi-typescript/issues/2165) | issue | separating required properties from schema object generates Record<string, neve… | 1 / 1 | 0 |  |
| 153 | [#2546](https://github.com/openapi-ts/openapi-typescript/pull/2546) | pr | Fix array `minItems`/`maxItems` bugs | 1 / 0 | 5 | ready |
| 155 | [#2330](https://github.com/openapi-ts/openapi-typescript/pull/2330) | pr | Fix nested length-constrained array generation | 1 / 0 | 4 | ready |
| 158 | [#2855](https://github.com/openapi-ts/openapi-typescript/pull/2855) | pr | fix(openapi-typescript): redundant nested unions from type arrays with anyOf/al… | 1 / 0 | 2 | ready |
| 162 | [#1665](https://github.com/openapi-ts/openapi-typescript/issues/1665) | issue | Types derived for oneOf construct result in TS2502 error | 0 / 0 | 10 |  |
| 164 | [#1690](https://github.com/openapi-ts/openapi-typescript/issues/1690) | issue | discriminator mapping ignored when using allOf with oneOf | 0 / 0 | 6 |  |
| 165 | [#2206](https://github.com/openapi-ts/openapi-typescript/pull/2206) | pr | Skip Schema prefix trimmin if --enum is used with --root-types-no-schema-prefix | 0 / 0 | 6 | ready, conflicts |
| 170 | [#1905](https://github.com/openapi-ts/openapi-typescript/issues/1905) | issue | openapi-typescript with custom redocly config runs forever | 0 / 0 | 4 |  |
| 171 | [#2093](https://github.com/openapi-ts/openapi-typescript/issues/2093) | issue | Required in path converts to required in query too | 0 / 0 | 4 |  |
| 172 | [#2162](https://github.com/openapi-ts/openapi-typescript/issues/2162) | issue | Required flag missing on property when it is referenced with 'discriminator' | 0 / 0 | 4 |  |
| 174 | [#2694](https://github.com/openapi-ts/openapi-typescript/pull/2694) | pr | Fix boolean flags not being parsed as bools and thus consuming the input argume… | 0 / 0 | 4 | ready |
| 183 | [#2608](https://github.com/openapi-ts/openapi-typescript/pull/2608) | pr | fix: anyOf with sibling properties generates intersection instead of … | 0 / 0 | 3 | ready, closes #2380 |
| 187 | [#2764](https://github.com/openapi-ts/openapi-typescript/pull/2764) | pr | fix(openapi-typescript): resolve CLI hang when multi-word flags precede schema… | 0 / 0 | 3 | ready, closes #2523 |
| 194 | [#2850](https://github.com/openapi-ts/openapi-typescript/pull/2850) | pr | Handle required-only allOf constraints | 0 / 0 | 3 | ready, closes #1474 |
| 197 | [#1893](https://github.com/openapi-ts/openapi-typescript/pull/1893) | pr | fix(openapi-typescript): correct generated type when using `prefixItems` | 0 / 0 | 2 | ready, closes #1892 |
| 198 | [#2143](https://github.com/openapi-ts/openapi-typescript/pull/2143) | pr | fix(openapi-typescript): missing jsdocs comment anyof nested schema | 0 / 0 | 2 | draft, conflicts |
| 199 | [#2200](https://github.com/openapi-ts/openapi-typescript/issues/2200) | issue | Discriminator dependent type generation differs based on alphabetical order of… | 0 / 0 | 2 |  |
| 203 | [#2431](https://github.com/openapi-ts/openapi-typescript/issues/2431) | issue | Type check errors when loading from json file | 0 / 0 | 2 |  |
| 205 | [#2614](https://github.com/openapi-ts/openapi-typescript/issues/2614) | issue | Enum values not properly escaped | 0 / 0 | 2 |  |
| 207 | [#2737](https://github.com/openapi-ts/openapi-typescript/pull/2737) | pr | Strip null from FlattenedDeepRequired for enum-values to prevent type error | 0 / 0 | 2 | ready |
| 208 | [#2749](https://github.com/openapi-ts/openapi-typescript/pull/2749) | pr | fix(openapi-typescript): handle readonly arrays in ReadonlyArray helper | 0 / 0 | 2 | ready, closes #2714 |
| 212 | [#2807](https://github.com/openapi-ts/openapi-typescript/issues/2807) | issue | `--enum` flag doesn't convert empty string enums correctly | 0 / 0 | 2 | open PR #2812 |
| 213 | [#2812](https://github.com/openapi-ts/openapi-typescript/pull/2812) | pr | Fix empty string enum members with --enum | 0 / 0 | 2 | ready, closes #2807 |
| 219 | [#2828](https://github.com/openapi-ts/openapi-typescript/pull/2828) | pr | fix: handle property names with percent signs in JSON Pointers | 0 / 0 | 2 | ready, closes #2251 |
| 222 | [#2835](https://github.com/openapi-ts/openapi-typescript/pull/2835) | pr | fix(openapi-typescript): emit `$defs` as an optional property (#2664) | 0 / 0 | 2 | ready, closes #2664 |
| 224 | [#2838](https://github.com/openapi-ts/openapi-typescript/pull/2838) | pr | Fix invalid enum output when x-enum-descriptions contains a line break | 0 / 0 | 2 | ready |
| 229 | [#2858](https://github.com/openapi-ts/openapi-typescript/pull/2858) | pr | fix(openapi-typescript): allOf composition to use required from subschemas | 0 / 0 | 2 | ready |
| 237 | [#1647](https://github.com/openapi-ts/openapi-typescript/issues/1647) | issue | Multiple security schemes not supported | 0 / 0 | 1 |  |
| 239 | [#1940](https://github.com/openapi-ts/openapi-typescript/issues/1940) | issue | `"nullable": true` is not respected for empty objects. | 0 / 0 | 1 |  |
| 242 | [#2155](https://github.com/openapi-ts/openapi-typescript/issues/2155) | issue | Missing types | 0 / 0 | 1 |  |
| 244 | [#2187](https://github.com/openapi-ts/openapi-typescript/issues/2187) | issue | Parameter components have wrong name (?) | 0 / 0 | 1 |  |
| 248 | [#2319](https://github.com/openapi-ts/openapi-typescript/issues/2319) | issue | query parameters with default value are marked as optional | 0 / 0 | 1 |  |
| 254 | [#2576](https://github.com/openapi-ts/openapi-typescript/issues/2576) | issue | Optional fields incorrect on object types, expected null fields | 0 / 0 | 1 |  |
| 255 | [#2664](https://github.com/openapi-ts/openapi-typescript/issues/2664) | issue | $defs is getting required part of the schema | 0 / 0 | 1 | open PR #2835 |
| 257 | [#2726](https://github.com/openapi-ts/openapi-typescript/issues/2726) | issue | `read-write-markers` + `root-types` Generated types with read markers can't be… | 0 / 0 | 1 |  |
| 260 | [#1874](https://github.com/openapi-ts/openapi-typescript/issues/1874) | issue | Enum generation: duplicate identifiers | 0 / 0 | 0 |  |
| 261 | [#1879](https://github.com/openapi-ts/openapi-typescript/issues/1879) | issue | Schema generation leads to generating an invalid type | 0 / 0 | 0 |  |
| 262 | [#1892](https://github.com/openapi-ts/openapi-typescript/issues/1892) | issue | Incorrect type when using `prefixItems` | 0 / 0 | 0 | open PR #1893 |
| 263 | [#2128](https://github.com/openapi-ts/openapi-typescript/issues/2128) | issue | Generated schema type name starts with a number | 0 / 0 | 0 |  |
| 265 | [#2142](https://github.com/openapi-ts/openapi-typescript/issues/2142) | issue | the generated JSDoc comment does not include the descriptions from the nested s… | 0 / 0 | 0 |  |
| 273 | [#2349](https://github.com/openapi-ts/openapi-typescript/issues/2349) | issue | Error when the response has a field name called "summary" | 0 / 0 | 0 |  |
| 283 | [#2714](https://github.com/openapi-ts/openapi-typescript/issues/2714) | issue | `enumValues` + `immutable` generates broken `FlattenedDeepRequired` for readonl… | 0 / 0 | 0 | open PR #2749 |
| 285 | [#2775](https://github.com/openapi-ts/openapi-typescript/issues/2775) | issue | Discriminator enum property breaks enum value | 0 / 0 | 0 |  |

#### generator / feature (33)

| Rank | # | Type | Title | R / TU | Cm | Status |
|---:|---|---|---|---:|---:|---|
| 6 | [#1214](https://github.com/openapi-ts/openapi-typescript/issues/1214) | issue | Support for File Upload | 48 / 48 | 22 | open PR #2878 |
| 8 | [#2577](https://github.com/openapi-ts/openapi-typescript/issues/2577) | issue | Is there support for openapi 3.2? | 31 / 31 | 5 |  |
| 9 | [#941](https://github.com/openapi-ts/openapi-typescript/issues/941) | issue | [Feature request] Generate Enums AND Union types | 29 / 20 | 17 |  |
| 11 | [#2366](https://github.com/openapi-ts/openapi-typescript/issues/2366) | issue | Generate as const Enum-like Objects Alongside String Unions | 20 / 17 | 0 |  |
| 16 | [#922](https://github.com/openapi-ts/openapi-typescript/issues/922) | issue | Add support for security and securitySchemes | 16 / 16 | 12 |  |
| 22 | [#1922](https://github.com/openapi-ts/openapi-typescript/issues/1922) | issue | Option to only generate code for specific tags/operations | 12 / 12 | 1 |  |
| 24 | [#2373](https://github.com/openapi-ts/openapi-typescript/issues/2373) | issue | Support --type-mappings flag | 12 / 4 | 1 |  |
| 42 | [#1616](https://github.com/openapi-ts/openapi-typescript/issues/1616) | issue | Enhancing openapi-typescript for Improved Type Safety: Generating Arrays from E… | 6 / 6 | 14 |  |
| 50 | [#1606](https://github.com/openapi-ts/openapi-typescript/issues/1606) | issue | Add option to represent non-required properties as required fields in TS with `… | 5 / 5 | 4 |  |
| 77 | [#2457](https://github.com/openapi-ts/openapi-typescript/issues/2457) | issue | Improve ergonomics with regards to `exactOptionalPropertyTypes` | 3 / 3 | 1 |  |
| 95 | [#1955](https://github.com/openapi-ts/openapi-typescript/issues/1955) | issue | Add support for @pattern, @format, @nullable | 2 / 2 | 3 | open PR #2649 |
| 113 | [#1738](https://github.com/openapi-ts/openapi-typescript/issues/1738) | issue | CLI option to validate existing file | 2 / 0 | 8 |  |
| 114 | [#2683](https://github.com/openapi-ts/openapi-typescript/pull/2683) | pr | feat: support OpenAPI 3.2 itemSchema (SSE/streaming) | 2 / 0 | 5 | ready |
| 157 | [#2845](https://github.com/openapi-ts/openapi-typescript/pull/2845) | pr | feat(openapi-typescript): add --no-lint flag to skip Redocly linting | 1 / 0 | 2 | ready, closes #2840 |
| 176 | [#2814](https://github.com/openapi-ts/openapi-typescript/pull/2814) | pr | feat(openapi-typescript): flow-style YAML support | 0 / 0 | 4 | ready |
| 177 | [#2840](https://github.com/openapi-ts/openapi-typescript/issues/2840) | issue | Add ability to disable linting | 0 / 0 | 4 | open PR #2845 |
| 179 | [#2029](https://github.com/openapi-ts/openapi-typescript/issues/2029) | issue | implement OAS3.1 dynamic references | 0 / 0 | 3 | open PR #2824 |
| 186 | [#2690](https://github.com/openapi-ts/openapi-typescript/pull/2690) | pr | feat(openapi-typescript): map OpenAPI int64 formats to bigint | 0 / 0 | 3 | ready |
| 193 | [#2836](https://github.com/openapi-ts/openapi-typescript/pull/2836) | pr | feat(openapi-typescript): new feature to generate a subset of the api definitio… | 0 / 0 | 3 | ready |
| 206 | [#2649](https://github.com/openapi-ts/openapi-typescript/pull/2649) | pr | feat(openapi-typescript): add JSDoc @format, @pattern, @nullable tags | 0 / 0 | 2 | ready, closes #1955 |
| 216 | [#2824](https://github.com/openapi-ts/openapi-typescript/pull/2824) | pr | feat: add $dynamicRef and $dynamicAnchor support (OpenAPI 3.1 / JSON Schema 202… | 0 / 0 | 2 | ready, closes #2029 |
| 223 | [#2837](https://github.com/openapi-ts/openapi-typescript/pull/2837) | pr | Support content attribute with a schema in parameter definitions | 0 / 0 | 2 | ready |
| 234 | [#2878](https://github.com/openapi-ts/openapi-typescript/pull/2878) | pr | feat: add --binary-as-blob to type raw binary strings as Blob | 0 / 0 | 2 | ready, closes #1214 |
| 238 | [#1721](https://github.com/openapi-ts/openapi-typescript/issues/1721) | issue | Redocly decorators not working | 0 / 0 | 1 |  |
| 240 | [#1984](https://github.com/openapi-ts/openapi-typescript/issues/1984) | issue | Enum extensions - format description as jsdoc instead of comments | 0 / 0 | 1 |  |
| 245 | [#2237](https://github.com/openapi-ts/openapi-typescript/issues/2237) | issue | Add a cli option to specify date type | 0 / 0 | 1 |  |
| 249 | [#2371](https://github.com/openapi-ts/openapi-typescript/issues/2371) | issue | Add support for JSON Schema `examples` keyword on Schema objects | 0 / 0 | 1 |  |
| 259 | [#2880](https://github.com/openapi-ts/openapi-typescript/pull/2880) | pr | feat: support unevaluatedProperties | 0 / 0 | 1 | ready, closes #2839 |
| 264 | [#2135](https://github.com/openapi-ts/openapi-typescript/issues/2135) | issue | Option to add JSDoc to generated enums. | 0 / 0 | 0 |  |
| 268 | [#2192](https://github.com/openapi-ts/openapi-typescript/issues/2192) | issue | Adding Schema Identifier to Type in fields generated from oneOf. | 0 / 0 | 0 |  |
| 278 | [#2529](https://github.com/openapi-ts/openapi-typescript/issues/2529) | issue | Proposal: New flag "--empty-objects-ignore" | 0 / 0 | 0 |  |
| 281 | [#2569](https://github.com/openapi-ts/openapi-typescript/issues/2569) | issue | Improve type-safety of query parameters with `content` field | 0 / 0 | 0 |  |
| 286 | [#2839](https://github.com/openapi-ts/openapi-typescript/issues/2839) | issue | Support for `unevaluatedProperties` | 0 / 0 | 0 | open PR #2880 |

#### generator / ts7 (9)

| Rank | # | Type | Title | R / TU | Cm | Status |
|---:|---|---|---|---:|---:|---|
| 1 | [#2723](https://github.com/openapi-ts/openapi-typescript/issues/2723) | issue | Add support for TypeScript 6 | 97 / 97 | 8 | open PR #2774 |
| 2 | [#2774](https://github.com/openapi-ts/openapi-typescript/pull/2774) | pr | feat: add TypeScript 6 support | 87 / 51 | 19 | ready, conflicts, closes #2723 |
| 4 | [#2841](https://github.com/openapi-ts/openapi-typescript/issues/2841) | issue | openapi-typescript doesn't work with Typescript 7 | 57 / 57 | 8 | open PR #2867, #2877 |
| 7 | [#2550](https://github.com/openapi-ts/openapi-typescript/issues/2550) | issue | Not TS 6 compliant | 38 / 38 | 0 |  |
| 12 | [#2818](https://github.com/openapi-ts/openapi-typescript/pull/2818) | pr | feat: Typescript 6 support | 20 / 7 | 16 | ready, conflicts |
| 27 | [#2872](https://github.com/openapi-ts/openapi-typescript/pull/2872) | pr | Support TypeScript 6 and 7 without a runtime compiler dependency | 9 / 7 | 4 | ready, conflicts |
| 178 | [#2867](https://github.com/openapi-ts/openapi-typescript/pull/2867) | pr | Support TypeScript 7 applications with a package-owned compiler | 0 / 0 | 4 | ready, closes #2841 |
| 214 | [#2815](https://github.com/openapi-ts/openapi-typescript/pull/2815) | pr | fix(types): declare types condition in exports for ESM consumers | 0 / 0 | 2 | ready |
| 233 | [#2877](https://github.com/openapi-ts/openapi-typescript/pull/2877) | pr | docs: propose string generation API for next major | 0 / 0 | 2 | draft, closes #2841 |

#### generator / security (4)

| Rank | # | Type | Title | R / TU | Cm | Status |
|---:|---|---|---|---:|---:|---|
| 18 | [#2644](https://github.com/openapi-ts/openapi-typescript/issues/2644) | issue | Upgrade @redocly/openapi-core from 1.x to 2.x to resolve minimatch vulnerabilit… | 14 / 14 | 4 |  |
| 34 | [#2846](https://github.com/openapi-ts/openapi-typescript/issues/2846) | issue | Latest openapi-typescript pulls vulnerable js-yaml via archived @redocly/openap… | 8 / 8 | 1 |  |
| 46 | [#2848](https://github.com/openapi-ts/openapi-typescript/issues/2848) | issue | Vulnerability with brace-expansion | 6 / 6 | 0 |  |
| 175 | [#2707](https://github.com/openapi-ts/openapi-typescript/pull/2707) | pr | Chore/upgrade redocly v2 | 0 / 0 | 4 | ready, conflicts |

### 4.2. fetch

#### fetch / bug (34)

| Rank | # | Type | Title | R / TU | Cm | Status |
|---:|---|---|---|---:|---:|---|
| 14 | [#1723](https://github.com/openapi-ts/openapi-typescript/issues/1723) | issue | Union type for `error` disappears in typescript-fetch v0.10 | 17 / 17 | 30 |  |
| 29 | [#2530](https://github.com/openapi-ts/openapi-typescript/issues/2530) | issue | When a server returns an error status code without content, the error is presen… | 8 / 8 | 8 | open PR #2762 |
| 31 | [#2224](https://github.com/openapi-ts/openapi-typescript/issues/2224) | issue | Allow Internal API Requests | 8 / 8 | 4 |  |
| 43 | [#1882](https://github.com/openapi-ts/openapi-typescript/issues/1882) | issue | openapi-fetch `Type instantiation is excessively deep and possibly infinite.` | 6 / 6 | 8 |  |
| 49 | [#2111](https://github.com/openapi-ts/openapi-typescript/issues/2111) | issue | Request body is omitted from POST requests in Next.js | 5 / 5 | 7 |  |
| 51 | [#2329](https://github.com/openapi-ts/openapi-typescript/issues/2329) | issue | Excess parameters allowed in createClient endpoint calls | 5 / 5 | 1 |  |
| 53 | [#2291](https://github.com/openapi-ts/openapi-typescript/issues/2291) | issue | Differentiate between success and error for empty responses | 5 / 5 | 0 |  |
| 66 | [#1525](https://github.com/openapi-ts/openapi-typescript/issues/1525) | issue | Query param type safety only works for the first param. | 3 / 3 | 10 |  |
| 72 | [#1977](https://github.com/openapi-ts/openapi-typescript/issues/1977) | issue | `Unexpected end of JSON input` with empty response | 3 / 3 | 2 | open PR #1986 |
| 76 | [#2350](https://github.com/openapi-ts/openapi-typescript/issues/2350) | issue | If error responses do not declare a content type, then success responses can be… | 3 / 3 | 1 |  |
| 79 | [#1769](https://github.com/openapi-ts/openapi-typescript/issues/1769) | issue | Undefined properties on body object are not flagged if required fields are fill… | 3 / 2 | 7 |  |
| 87 | [#1862](https://github.com/openapi-ts/openapi-typescript/issues/1862) | issue | client.GET response type is "never" with apis that only define a default respon… | 3 / 0 | 1 |  |
| 89 | [#1635](https://github.com/openapi-ts/openapi-typescript/issues/1635) | issue | 0.9.4 breaks some Typescript configurations | 2 / 2 | 12 |  |
| 90 | [#1986](https://github.com/openapi-ts/openapi-typescript/pull/1986) | pr | fix(#1977): refactor handling for empty responses | 2 / 2 | 7 | draft, conflicts, closes #1977 |
| 109 | [#2363](https://github.com/openapi-ts/openapi-typescript/issues/2363) | issue | incorrectly sent  "Content-Length": "" | 2 / 2 | 0 |  |
| 119 | [#2188](https://github.com/openapi-ts/openapi-typescript/issues/2188) | issue | Library-generated Promises cannot be passed down to Next.js Client Components a… | 2 / 0 | 0 |  |
| 127 | [#2382](https://github.com/openapi-ts/openapi-typescript/issues/2382) | issue | Incorrect processing of requests with text/plain body | 1 / 1 | 3 |  |
| 128 | [#2486](https://github.com/openapi-ts/openapi-typescript/issues/2486) | issue | Component caching with Math.random in openapi-fetch | 1 / 1 | 3 | open PR #2763 |
| 130 | [#1847](https://github.com/openapi-ts/openapi-typescript/issues/1847) | issue | onRequest: must return new Request() when modifying the request | 1 / 1 | 2 |  |
| 136 | [#2763](https://github.com/openapi-ts/openapi-typescript/pull/2763) | pr | fix(openapi-fetch): replace Math.random() with deterministic counter for reques… | 1 / 1 | 2 | ready, closes #2486 |
| 138 | [#2360](https://github.com/openapi-ts/openapi-typescript/issues/2360) | issue | Types do not narrow by response code correctly. | 1 / 1 | 1 |  |
| 141 | [#2531](https://github.com/openapi-ts/openapi-typescript/issues/2531) | issue | `result.error` is undefined but server returned 429 response | 1 / 1 | 1 |  |
| 148 | [#2554](https://github.com/openapi-ts/openapi-typescript/issues/2554) | issue | Multipart Upload Throws Error on Expo RN App | 1 / 1 | 0 |  |
| 173 | [#2637](https://github.com/openapi-ts/openapi-typescript/pull/2637) | pr | use typeof for cross-realm function detection | 0 / 0 | 4 | ready |
| 195 | [#1736](https://github.com/openapi-ts/openapi-typescript/issues/1736) | issue | Headers lost in fetch request when using BUN | 0 / 0 | 2 |  |
| 200 | [#2236](https://github.com/openapi-ts/openapi-typescript/issues/2236) | issue | Can't make it work with expo/fetch | 0 / 0 | 2 |  |
| 204 | [#2562](https://github.com/openapi-ts/openapi-typescript/issues/2562) | issue | Type issues when using undici | 0 / 0 | 2 |  |
| 209 | [#2761](https://github.com/openapi-ts/openapi-typescript/pull/2761) | pr | fix(openapi-fetch): pass string bodies through without JSON serialization | 0 / 0 | 2 | ready, closes #2555 |
| 210 | [#2762](https://github.com/openapi-ts/openapi-typescript/pull/2762) | pr | fix(openapi-fetch): return truthy error for empty error response bodies | 0 / 0 | 2 | ready, closes #2530 |
| 247 | [#2317](https://github.com/openapi-ts/openapi-typescript/issues/2317) | issue | Propagate request's response to be able to read status codes, and more | 0 / 0 | 1 |  |
| 252 | [#2555](https://github.com/openapi-ts/openapi-typescript/issues/2555) | issue | The `defaultSerializer` adds unwanted quotes when `typeof body === "string"` (d… | 0 / 0 | 1 | open PR #2761 |
| 271 | [#2328](https://github.com/openapi-ts/openapi-typescript/issues/2328) | issue | When sending multipart/form-data, the Content-Length header is set incorrectly… | 0 / 0 | 0 |  |
| 276 | [#2461](https://github.com/openapi-ts/openapi-typescript/issues/2461) | issue | Awkward typing when response is undefined | 0 / 0 | 0 |  |
| 279 | [#2557](https://github.com/openapi-ts/openapi-typescript/issues/2557) | issue | Middleware onError doesn't work | 0 / 0 | 0 |  |

#### fetch / feature (26)

| Rank | # | Type | Title | R / TU | Cm | Status |
|---:|---|---|---|---:|---:|---|
| 13 | [#1970](https://github.com/openapi-ts/openapi-typescript/pull/1970) | pr | feat: narrow type based on status code | 19 / 0 | 11 | ready, conflicts |
| 28 | [#1328](https://github.com/openapi-ts/openapi-typescript/issues/1328) | issue | run-time serialization and deserialization of custom formats | 8 / 8 | 12 |  |
| 30 | [#2073](https://github.com/openapi-ts/openapi-typescript/issues/2073) | issue | Allow onRequest middleware to add headers that the schema requires | 8 / 8 | 6 |  |
| 44 | [#2022](https://github.com/openapi-ts/openapi-typescript/issues/2022) | issue | Suggestion: improve readability of data type | 6 / 6 | 1 |  |
| 60 | [#2432](https://github.com/openapi-ts/openapi-typescript/issues/2432) | issue | Support for streaming/NDJSON | 4 / 4 | 1 |  |
| 67 | [#1985](https://github.com/openapi-ts/openapi-typescript/issues/1985) | issue | Aborting requests with expired tokens from the Authentication Middleware | 3 / 3 | 4 |  |
| 73 | [#2204](https://github.com/openapi-ts/openapi-typescript/issues/2204) | issue | RFC: openapi-fetch 1.0 runtime hinting feature (codegen) | 3 / 3 | 2 |  |
| 78 | [#2805](https://github.com/openapi-ts/openapi-typescript/issues/2805) | issue | Typed headers in the openapi-fetch FetchResponse | 3 / 3 | 0 |  |
| 84 | [#2853](https://github.com/openapi-ts/openapi-typescript/pull/2853) | pr | feat: add support for the HTTP QUERY method (RFC 10008) | 3 / 1 | 3 | ready, conflicts |
| 86 | [#1462](https://github.com/openapi-ts/openapi-typescript/issues/1462) | issue | Allow go to definition to work for paths (trpc style) | 3 / 0 | 2 |  |
| 100 | [#2392](https://github.com/openapi-ts/openapi-typescript/issues/2392) | issue | Question: Can we leverage `paths`’ per-status response types to narrow `data`/`… | 2 / 2 | 2 |  |
| 117 | [#2553](https://github.com/openapi-ts/openapi-typescript/issues/2553) | issue | Pass reviver when parsing JSON | 2 / 0 | 1 |  |
| 135 | [#2542](https://github.com/openapi-ts/openapi-typescript/pull/2542) | pr | Provide unserialized body to onRequest middleware | 1 / 1 | 2 | ready |
| 142 | [#2660](https://github.com/openapi-ts/openapi-typescript/issues/2660) | issue | Allow for custom params passed from RequestOptions to MiddlewareCallbackParams | 1 / 1 | 1 |  |
| 146 | [#2378](https://github.com/openapi-ts/openapi-typescript/issues/2378) | issue | Don't skip onResponse middleware when onRequest returns a Response object | 1 / 1 | 0 |  |
| 147 | [#2455](https://github.com/openapi-ts/openapi-typescript/issues/2455) | issue | Both data and error should not be undefiend when the openapischema doesn't defi… | 1 / 1 | 0 |  |
| 149 | [#2633](https://github.com/openapi-ts/openapi-typescript/issues/2633) | issue | Type system doesn't enforce parseAs for text/plain responses, causing silent ru… | 1 / 1 | 0 |  |
| 152 | [#1771](https://github.com/openapi-ts/openapi-typescript/issues/1771) | issue | Support cookie parameters | 1 / 0 | 5 |  |
| 163 | [#1631](https://github.com/openapi-ts/openapi-typescript/issues/1631) | issue | Allow client option for custom dispatcher into fetch requests (e.g. to disable… | 0 / 0 | 8 |  |
| 181 | [#2387](https://github.com/openapi-ts/openapi-typescript/issues/2387) | issue | Deeply-nested arrays/objects aren’t supported in query params | 0 / 0 | 3 |  |
| 196 | [#1832](https://github.com/openapi-ts/openapi-typescript/issues/1832) | issue | Replace `Array<T>` with `Iterable<T>` in request parameters | 0 / 0 | 2 |  |
| 225 | [#2844](https://github.com/openapi-ts/openapi-typescript/pull/2844) | pr | Add support for HTTP QUERY verb (RFC 10008) | 0 / 0 | 2 | ready |
| 241 | [#2109](https://github.com/openapi-ts/openapi-typescript/issues/2109) | issue | Non-nullish data field | 0 / 0 | 1 |  |
| 243 | [#2159](https://github.com/openapi-ts/openapi-typescript/issues/2159) | issue | Change defaults in fetch options | 0 / 0 | 1 |  |
| 251 | [#2544](https://github.com/openapi-ts/openapi-typescript/issues/2544) | issue | Request: How to post using navigator.sendBeacon | 0 / 0 | 1 |  |
| 280 | [#2567](https://github.com/openapi-ts/openapi-typescript/issues/2567) | issue | Adding a signal to all fetch requests | 0 / 0 | 0 |  |

#### fetch / security (1)

| Rank | # | Type | Title | R / TU | Cm | Status |
|---:|---|---|---|---:|---:|---|
| 277 | [#2483](https://github.com/openapi-ts/openapi-typescript/issues/2483) | issue | Prevent Logical Path Traversal with `..` in Path Parameters | 0 / 0 | 0 |  |

#### fetch / meta (1)

| Rank | # | Type | Title | R / TU | Cm | Status |
|---:|---|---|---|---:|---:|---|
| 166 | [#1818](https://github.com/openapi-ts/openapi-typescript/issues/1818) | issue | Better Benchmarking for openapi-fetch? | 0 / 0 | 5 |  |

### 4.3. react-query

#### react-query / bug (29)

| Rank | # | Type | Title | R / TU | Cm | Status |
|---:|---|---|---|---:|---:|---|
| 33 | [#2343](https://github.com/openapi-ts/openapi-typescript/issues/2343) | issue | Error type incorrectly inferred | 8 / 8 | 2 |  |
| 38 | [#2100](https://github.com/openapi-ts/openapi-typescript/issues/2100) | issue | Params are missing in mutationKey | 7 / 7 | 4 |  |
| 45 | [#2355](https://github.com/openapi-ts/openapi-typescript/issues/2355) | issue | @tanstack/react-query 5.80.x breaks useInfiniteQuery inference | 6 / 6 | 0 |  |
| 59 | [#2258](https://github.com/openapi-ts/openapi-typescript/issues/2258) | issue | useInfiniteQuery's select option does not infer correct type | 4 / 4 | 1 |  |
| 69 | [#2459](https://github.com/openapi-ts/openapi-typescript/pull/2459) | pr | Fix: useInfiniteQuery type | 3 / 3 | 4 | ready, closes #2458 |
| 75 | [#2234](https://github.com/openapi-ts/openapi-typescript/issues/2234) | issue | React-query can't handle return data that's undefined (From 204 response return… | 3 / 3 | 1 |  |
| 81 | [#2151](https://github.com/openapi-ts/openapi-typescript/issues/2151) | issue | Type for `useQuery` error dosen't cover unexpected errors | 3 / 2 | 2 |  |
| 97 | [#2671](https://github.com/openapi-ts/openapi-typescript/pull/2671) | pr | Fix useInfiniteQuery query key collision with useQuery | 2 / 2 | 3 | ready, closes #2184 |
| 99 | [#2354](https://github.com/openapi-ts/openapi-typescript/issues/2354) | issue | Options parameter is missing in useMutation | 2 / 2 | 2 |  |
| 101 | [#2458](https://github.com/openapi-ts/openapi-typescript/issues/2458) | issue | useInfiniteQuery types are unsafe: required pagination options (e.g. getNextPag… | 2 / 2 | 2 | open PR #2459 |
| 104 | [#2372](https://github.com/openapi-ts/openapi-typescript/issues/2372) | issue | Bug Report: Response["error"] does not type all thrown errors (middleware/fetch… | 2 / 2 | 1 |  |
| 107 | [#2178](https://github.com/openapi-ts/openapi-typescript/issues/2178) | issue | `typeof api.queryOptions` has `path: never` in parameter list and return type `… | 2 / 2 | 0 |  |
| 111 | [#2464](https://github.com/openapi-ts/openapi-typescript/issues/2464) | issue | Data is null, not undefined when 204 or content-length 0 | 2 / 2 | 0 |  |
| 132 | [#2344](https://github.com/openapi-ts/openapi-typescript/issues/2344) | issue | API calls do not use the content-type | 1 / 1 | 2 |  |
| 137 | [#2070](https://github.com/openapi-ts/openapi-typescript/issues/2070) | issue | openapi-react-query does not propagate `undefined` errors from openapi-fetch | 1 / 1 | 1 | open PR #2829 |
| 150 | [#2642](https://github.com/openapi-ts/openapi-typescript/issues/2642) | issue | useQuery silently accepts `queryOptions` in the `options` parameter without typ… | 1 / 1 | 0 | open PR #2857 |
| 169 | [#2829](https://github.com/openapi-ts/openapi-typescript/pull/2829) | pr | fix(openapi-react-query): propagate undefined errors from empty-body non-OK res… | 0 / 0 | 5 | ready, closes #2070 |
| 218 | [#2826](https://github.com/openapi-ts/openapi-typescript/pull/2826) | pr | Fix undefined initial page param in useInfiniteQuery | 0 / 0 | 2 | ready, closes #2715 |
| 228 | [#2857](https://github.com/openapi-ts/openapi-typescript/pull/2857) | pr | fix(openapi-react-query): reject query options as request init | 0 / 0 | 2 | ready, closes #2642 |
| 231 | [#2865](https://github.com/openapi-ts/openapi-typescript/pull/2865) | pr | fix(openapi-react-query): reject undeclared query and path parameters | 0 / 0 | 2 | ready, closes #2864 |
| 232 | [#2873](https://github.com/openapi-ts/openapi-typescript/pull/2873) | pr | fix(openapi-react-query): infer select callback data | 0 / 0 | 2 | ready |
| 236 | [#2882](https://github.com/openapi-ts/openapi-typescript/pull/2882) | pr | fix(openapi-react-query): infer endpoint response type in `select` callback (#2… | 0 / 0 | 2 | ready, closes #2852 |
| 250 | [#2463](https://github.com/openapi-ts/openapi-typescript/issues/2463) | issue | openapi-react-query resolves requests as success regardless of HTTP code if Con… | 0 / 0 | 1 |  |
| 258 | [#2864](https://github.com/openapi-ts/openapi-typescript/issues/2864) | issue | Query and path parameters the schema does not declare are accepted without a ty… | 0 / 0 | 1 | open PR #2865 |
| 267 | [#2184](https://github.com/openapi-ts/openapi-typescript/issues/2184) | issue | useInfiniteQuery clashes with useQuery query key for the same method & path & p… | 0 / 0 | 0 | open PR #2671 |
| 270 | [#2267](https://github.com/openapi-ts/openapi-typescript/issues/2267) | issue | useMutation type constraint error: paths missing index signature (Record<string… | 0 / 0 | 0 |  |
| 274 | [#2359](https://github.com/openapi-ts/openapi-typescript/issues/2359) | issue | Issue when using `queryKey` in `queryOptions` parameter of `useQuery` | 0 / 0 | 0 |  |
| 284 | [#2715](https://github.com/openapi-ts/openapi-typescript/issues/2715) | issue | `useInfiniteQuery` sends page param with value `0` on first page when `initialP… | 0 / 0 | 0 | open PR #2826 |
| 287 | [#2852](https://github.com/openapi-ts/openapi-typescript/issues/2852) | issue | useQuery select callback parameter is inferred as unknown instead of endpoint r… | 0 / 0 | 0 | open PR #2882 |

#### react-query / feature (27)

| Rank | # | Type | Title | R / TU | Cm | Status |
|---:|---|---|---|---:|---:|---|
| 10 | [#1806](https://github.com/openapi-ts/openapi-typescript/issues/1806) | issue | openapi-react-query: Add easy way of invalidating queries | 20 / 20 | 26 |  |
| 19 | [#2257](https://github.com/openapi-ts/openapi-typescript/issues/2257) | issue | Ability to access response object in onError function | 14 / 14 | 0 |  |
| 20 | [#2487](https://github.com/openapi-ts/openapi-typescript/pull/2487) | pr | Feat: add mutation options | 12 / 12 | 9 | ready, closes #2485 |
| 21 | [#2127](https://github.com/openapi-ts/openapi-typescript/issues/2127) | issue | openapi-react-query: allow access to response headers | 12 / 12 | 7 |  |
| 26 | [#2383](https://github.com/openapi-ts/openapi-typescript/issues/2383) | issue | openapi-react-query: Accessing http status code | 9 / 8 | 4 |  |
| 32 | [#2238](https://github.com/openapi-ts/openapi-typescript/issues/2238) | issue | Possibility to access the response status code for "not ok" responses. | 8 / 8 | 3 |  |
| 41 | [#2484](https://github.com/openapi-ts/openapi-typescript/pull/2484) | pr | Feat: add infinite query options | 7 / 0 | 4 | ready, conflicts, closes #2462 |
| 54 | [#2485](https://github.com/openapi-ts/openapi-typescript/issues/2485) | issue | Add mutationOptions (parity with TanStack Query) | 5 / 5 | 0 | open PR #2487 |
| 57 | [#1804](https://github.com/openapi-ts/openapi-typescript/issues/1804) | issue | openapi-react-query: Get query keys | 4 / 4 | 2 |  |
| 58 | [#2292](https://github.com/openapi-ts/openapi-typescript/pull/2292) | pr | feat(openapi-react-query): Add query client to create client | 4 / 4 | 2 | ready, conflicts |
| 61 | [#2516](https://github.com/openapi-ts/openapi-typescript/issues/2516) | issue | Allow excluding fields (like headers) from queryKey generation | 4 / 4 | 0 |  |
| 62 | [#2357](https://github.com/openapi-ts/openapi-typescript/pull/2357) | pr | feat(openapi-react-query): add prefixQueryKey option | 4 / 0 | 6 | ready, conflicts, closes #1979 |
| 65 | [#1941](https://github.com/openapi-ts/openapi-typescript/issues/1941) | issue | How to handle dependent queries? | 3 / 3 | 11 |  |
| 68 | [#2126](https://github.com/openapi-ts/openapi-typescript/pull/2126) | pr | Better typesafety for `useInfiniteQuery` | 3 / 3 | 4 | ready, conflicts |
| 82 | [#1898](https://github.com/openapi-ts/openapi-typescript/issues/1898) | issue | Support 'prefetchQuery' and 'invalidateKeys' on openapi-react-query | 3 / 2 | 0 |  |
| 85 | [#2462](https://github.com/openapi-ts/openapi-typescript/issues/2462) | issue | Add infiniteQueryOptions function | 3 / 0 | 3 | open PR #2484 |
| 93 | [#1979](https://github.com/openapi-ts/openapi-typescript/issues/1979) | issue | feat(react-query): Add client parameter to queryKey and remove options parameter | 2 / 2 | 4 | open PR #2357 |
| 103 | [#2326](https://github.com/openapi-ts/openapi-typescript/issues/2326) | issue | Support for infiniteQueryOptions and useSuspenseInfiniteQuery | 2 / 2 | 1 |  |
| 125 | [#2345](https://github.com/openapi-ts/openapi-typescript/issues/2345) | issue | openapi-react-query Feature Request: Expose useQueryClient | 1 / 1 | 4 |  |
| 133 | [#2430](https://github.com/openapi-ts/openapi-typescript/pull/2430) | pr | feat(openapi-react-query): Type-safe setQueryData | 1 / 1 | 2 | ready, conflicts |
| 134 | [#2492](https://github.com/openapi-ts/openapi-typescript/issues/2492) | issue | `getQueryData` does not infer correct type from `client.queryOptions` | 1 / 1 | 2 |  |
| 145 | [#2231](https://github.com/openapi-ts/openapi-typescript/issues/2231) | issue | Access response when errors occur/transform error value and type | 1 / 1 | 0 |  |
| 160 | [#2340](https://github.com/openapi-ts/openapi-typescript/issues/2340) | issue | initialPageParam in useInfiniteQuery shouldn't default to zero | 1 / 0 | 0 |  |
| 167 | [#2261](https://github.com/openapi-ts/openapi-typescript/issues/2261) | issue | improve mutation workflow | 0 / 0 | 5 |  |
| 168 | [#2352](https://github.com/openapi-ts/openapi-typescript/issues/2352) | issue | useInfiniteQuery should support dynamic pagination parameter location | 0 / 0 | 5 |  |
| 202 | [#2424](https://github.com/openapi-ts/openapi-typescript/issues/2424) | issue | Add a hook after query | 0 / 0 | 2 |  |
| 272 | [#2346](https://github.com/openapi-ts/openapi-typescript/issues/2346) | issue | Hope to export a Client that only exposes queryOptions | 0 / 0 | 0 |  |

### 4.4. helpers

#### helpers / bug (12)

| Rank | # | Type | Title | R / TU | Cm | Status |
|---:|---|---|---|---:|---:|---|
| 17 | [#2615](https://github.com/openapi-ts/openapi-typescript/issues/2615) | issue | `Readable` in new openapi-typescript-helpers is broken | 14 / 14 | 8 | open PR #2650 |
| 35 | [#2620](https://github.com/openapi-ts/openapi-typescript/issues/2620) | issue | `Readable` prevents type narrowing | 8 / 8 | 0 | open PR #2650 |
| 112 | [#2632](https://github.com/openapi-ts/openapi-typescript/issues/2632) | issue | Behavior change in 0.17.0 for array and prefixItems | 2 / 1 | 5 | open PR #2673 |
| 129 | [#2842](https://github.com/openapi-ts/openapi-typescript/pull/2842) | pr | Preserve tuples in readable and writable types | 1 / 1 | 3 | ready |
| 154 | [#2650](https://github.com/openapi-ts/openapi-typescript/pull/2650) | pr | fix: make Readable/Writable marker resolution opt-in, fix readonly arrays | 1 / 0 | 5 | ready, closes #2615, #2620 |
| 156 | [#2673](https://github.com/openapi-ts/openapi-typescript/pull/2673) | pr | fix(openapi-typescript-helpers): preserve tuple types in Readable/Writable | 1 / 0 | 2 | ready, closes #2632 |
| 159 | [#1854](https://github.com/openapi-ts/openapi-typescript/issues/1854) | issue | `SuccessResponseJSON` returns item instead of array of items | 1 / 0 | 0 |  |
| 161 | [#2765](https://github.com/openapi-ts/openapi-typescript/issues/2765) | issue | Readable/Writable breaks branded primitive types (string & {...}, number & {...… | 1 / 0 | 0 | open PR #2766 |
| 182 | [#2526](https://github.com/openapi-ts/openapi-typescript/pull/2526) | pr | fix(helpers): handle any type in RequiredKeysOf | 0 / 0 | 3 | ready, conflicts |
| 211 | [#2766](https://github.com/openapi-ts/openapi-typescript/pull/2766) | pr | fix(openapi-typescript): guard Readable/Writable against branded primitive types | 0 / 0 | 2 | ready, closes #2765 |
| 217 | [#2825](https://github.com/openapi-ts/openapi-typescript/pull/2825) | pr | Fix optional null request body properties | 0 / 0 | 2 | ready, closes #2717 |
| 256 | [#2717](https://github.com/openapi-ts/openapi-typescript/issues/2717) | issue | Request body `{ x?: null; }` mishandled (regression from 0.16.0) | 0 / 0 | 1 | open PR #2825 |

### 4.5. docs

#### docs / bug (6)

| Rank | # | Type | Title | R / TU | Cm | Status |
|---:|---|---|---|---:|---:|---|
| 63 | [#2005](https://github.com/openapi-ts/openapi-typescript/issues/2005) | issue | fetch: Docs misleading about per-request middleware | 4 / 0 | 4 |  |
| 64 | [#1947](https://github.com/openapi-ts/openapi-typescript/issues/1947) | issue | [openapi-react-query] Uncaught Error: No QueryClient set, use QueryClientProvid… | 3 / 3 | 14 |  |
| 118 | [#2034](https://github.com/openapi-ts/openapi-typescript/issues/2034) | issue | [openapi-react-query] Misleading useQuery functionKey documentation | 2 / 0 | 0 |  |
| 185 | [#2655](https://github.com/openapi-ts/openapi-typescript/pull/2655) | pr | packages/openapi-react-query: Update createClient documentation | 0 / 0 | 3 | ready |
| 226 | [#2851](https://github.com/openapi-ts/openapi-typescript/pull/2851) | pr | docs: fix occurred typo in react-query examples | 0 / 0 | 2 | ready |
| 275 | [#2425](https://github.com/openapi-ts/openapi-typescript/issues/2425) | issue | Links to OpenAPI schemas out of date - all links receive 404s | 0 / 0 | 0 |  |

#### docs / feature (6)

| Rank | # | Type | Title | R / TU | Cm | Status |
|---:|---|---|---|---:|---:|---|
| 40 | [#2242](https://github.com/openapi-ts/openapi-typescript/issues/2242) | issue | Update docs and examples for Next.js | 7 / 4 | 0 |  |
| 144 | [#2193](https://github.com/openapi-ts/openapi-typescript/issues/2193) | issue | Docs: Add Differences with orval.dev | 1 / 1 | 0 |  |
| 180 | [#2044](https://github.com/openapi-ts/openapi-typescript/issues/2044) | issue | openapi-typescript-helpers documentation | 0 / 0 | 3 |  |
| 215 | [#2820](https://github.com/openapi-ts/openapi-typescript/pull/2820) | pr | Update feature-fetch and openapi-ts-router examples | 0 / 0 | 2 | ready, conflicts |
| 220 | [#2833](https://github.com/openapi-ts/openapi-typescript/pull/2833) | pr | Added global- and request scope middleware distinction to documentation | 0 / 0 | 2 | ready |
| 282 | [#2621](https://github.com/openapi-ts/openapi-typescript/issues/2621) | issue | Not needing manual type definitions for server | 0 / 0 | 0 |  |

#### docs / ts7 (1)

| Rank | # | Type | Title | R / TU | Cm | Status |
|---:|---|---|---|---:|---:|---|
| 230 | [#2862](https://github.com/openapi-ts/openapi-typescript/pull/2862) | pr | docs: clarify compiler setup for TypeScript 7 applications | 0 / 0 | 2 | ready |

### 4.6. other

#### other / bug (3)

| Rank | # | Type | Title | R / TU | Cm | Status |
|---:|---|---|---|---:|---:|---|
| 201 | [#2240](https://github.com/openapi-ts/openapi-typescript/issues/2240) | issue | TypeScript error: inferred type of 'useMutate' cannot be named without a refere… | 0 / 0 | 2 |  |
| 253 | [#2558](https://github.com/openapi-ts/openapi-typescript/issues/2558) | issue | AbortSignal is converted to plain object by unwrapRefs in Vue client | 0 / 0 | 1 |  |
| 269 | [#2259](https://github.com/openapi-ts/openapi-typescript/issues/2259) | issue | support func argument for swr mutate | 0 / 0 | 0 |  |

#### other / feature (8)

| Rank | # | Type | Title | R / TU | Cm | Status |
|---:|---|---|---|---:|---:|---|
| 23 | [#2133](https://github.com/openapi-ts/openapi-typescript/issues/2133) | issue | Add support for Axios | 12 / 5 | 1 |  |
| 39 | [#2367](https://github.com/openapi-ts/openapi-typescript/issues/2367) | issue | Wrapper for useSWRMutation | 7 / 7 | 4 |  |
| 92 | [#2097](https://github.com/openapi-ts/openapi-typescript/issues/2097) | issue | [openapi-metadata] Support for CommonJS | 2 / 2 | 5 |  |
| 108 | [#2191](https://github.com/openapi-ts/openapi-typescript/issues/2191) | issue | Add openapi-solid-query | 2 / 2 | 0 |  |
| 110 | [#2438](https://github.com/openapi-ts/openapi-typescript/issues/2438) | issue | Get response headers | 2 / 2 | 0 |  |
| 116 | [#2056](https://github.com/openapi-ts/openapi-typescript/issues/2056) | issue | Support Pinia Colada | 2 / 0 | 2 |  |
| 151 | [#2566](https://github.com/openapi-ts/openapi-typescript/issues/2566) | issue | New package: openapi-fetch-mock \| Fully typed mocking of fetch calls for tests | 1 / 0 | 6 |  |
| 246 | [#2247](https://github.com/openapi-ts/openapi-typescript/issues/2247) | issue | Access Response alongside data, error, isLoading, etc. | 0 / 0 | 1 |  |

#### other / security (4)

| Rank | # | Type | Title | R / TU | Cm | Status |
|---:|---|---|---|---:|---:|---|
| 188 | [#2810](https://github.com/openapi-ts/openapi-typescript/pull/2810) | pr | Bump next from 15.5.12 to 15.5.18 | 0 / 0 | 3 | ready, conflicts |
| 189 | [#2811](https://github.com/openapi-ts/openapi-typescript/pull/2811) | pr | Bump svelte from 5.53.5 to 5.55.7 | 0 / 0 | 3 | ready, conflicts |
| 192 | [#2821](https://github.com/openapi-ts/openapi-typescript/pull/2821) | pr | Bump turbo from 2.9.9 to 2.9.14 | 0 / 0 | 3 | ready |
| 235 | [#2879](https://github.com/openapi-ts/openapi-typescript/pull/2879) | pr | ci: add npmscan PR dependency scan | 0 / 0 | 2 | ready |

#### other / meta (8)

| Rank | # | Type | Title | R / TU | Cm | Status |
|---:|---|---|---|---:|---:|---|
| 3 | [#2874](https://github.com/openapi-ts/openapi-typescript/issues/2874) | issue | openapi-typescript in maintenance mode | 78 / 8 | 5 |  |
| 5 | [#2843](https://github.com/openapi-ts/openapi-typescript/issues/2843) | issue | Is this project still maintained? | 50 / 50 | 2 |  |
| 184 | [#2616](https://github.com/openapi-ts/openapi-typescript/pull/2616) | pr | [ci] release | 0 / 0 | 3 | ready |
| 190 | [#2816](https://github.com/openapi-ts/openapi-typescript/pull/2816) | pr | Bump @sveltejs/kit from 2.52.2 to 2.60.1 | 0 / 0 | 3 | ready, conflicts |
| 191 | [#2817](https://github.com/openapi-ts/openapi-typescript/pull/2817) | pr | Bump @tootallnate/once from 2.0.0 to 2.0.1 | 0 / 0 | 3 | ready |
| 221 | [#2834](https://github.com/openapi-ts/openapi-typescript/pull/2834) | pr | chore: align Biome config with pinned 2.4.14 and modern folder-ignore syntax | 0 / 0 | 2 | ready |
| 227 | [#2854](https://github.com/openapi-ts/openapi-typescript/pull/2854) | pr | fix(ci): unblock test-e2e by upgrading Playwright past the yauzl hang | 0 / 0 | 2 | ready, conflicts |
| 266 | [#2173](https://github.com/openapi-ts/openapi-typescript/issues/2173) | issue | Dependency Dashboard | 0 / 0 | 0 |  |

## 5. Candidates for our Phase 7 backlog

Selection rule: high value (reactions, crash or invalid output, security, many duplicates) for low or medium
effort, and compatible with the drop-in promise. Items are grouped when they share one root cause. Reaction sums
are over all listed items.

**Effort:** S = up to 1 day, M = 2–4 days, L = more than a week.
**Output change** — would the generated `.d.ts` change for a schema that works today?

- **No** — safe as a default.
- **Invalid only** — changes only output that does not compile or crashes today. We propose to ship these as
  default bug fixes under task 7.4 (listed in the "intentional differences" section of the compatibility report).
- **Yes → opt-in** — changes valid output. Must ship behind an opt-in flag (default off) to stay output-compatible.
- **Client behavior** — no generated output change, but the client runtime or its types behave differently.
  Needs an opt-in option or an ADR before it becomes the default.

| # | Theme | Items | Pkg | Cat | Reactions (thumbs-up) | Effort | Output change | Notes |
|---:|---|---|---|---|---:|---|---|---|
| 1 | TS 6 / 7 install and run | #2723, #2550, #2841, #2774, #2818, #2872, #2867, #2877, #2815, #2862 | generator | ts7 | 308 (257) | L | No | The core of Phases 4–6; listed for traceability. #2872 and #2877 propose a compiler-free generator, like our IR plan. #2815 (`exports.types`) is a small packaging fix to take as is |
| 2 | Vulnerable `@redocly/openapi-core` 1.x (minimatch, js-yaml, brace-expansion) | #2644, #2846, #2848, #2707 | generator | security | 28 (28) | M | No (verify on corpus) | Decided by task 3.5 / ADR-005. Upstream will not patch (#2874). GHSA-g3hv-75wg-m249 (2026-10-27) reviewed in ADR-005: pattern-only, not reachable from a document |
| 3 | CLI hangs when kebab-case boolean flags come before the schema path | #2523, #1651, #2764, #2694 | generator | bug | 7 (7) | S | No | Root cause: `BOOLEAN_FLAGS` registered in camelCase. Fixed for free by the TS CLI port (7.3); add a test per flag |
| 4 | `--no-lint` flag to skip Redocly lint | #2840, #2845 | generator | feature | 1 (0) | S | No | New opt-in flag; also speeds up large schemas |
| 5 | Crash on `%` in a property name | #2251, #2828 | generator | bug | 1 (1) | S | Invalid only | `URIError` from JSON Pointer decoding |
| 6 | Crash when a schema property is named `summary` | #2349 | generator | bug | 0 (0) | S | Invalid only | `schemaObject.summary.replace is not a function` |
| 7 | Invalid `--enum` output: empty string member, unescaped `\`, line breaks in `x-enum-descriptions` | #2807, #2812, #2614, #2838 | generator | bug | 0 (0) | S | Invalid only | Low reactions but produce non-compiling TS; the new printer must escape correctly anyway |
| 8 | `--enum-values` with `--immutable` or nullable parents breaks `FlattenedDeepRequired` | #2714, #2749, #2737 | generator | bug | 0 (0) | S | Invalid only | Helper alias in the output footer |
| 9 | `--enum` + `--root-types-no-schema-prefix` name collisions | #2341, #2206, #2099 | generator | bug | 8 (7) | S | Invalid only | Duplicate identifiers today |
| 10 | `Readable` / `Writable` regressions from helpers 0.17 (narrowing, tuples, `{ x?: null }`, branded primitives, root types) | #2615, #2620, #2650, #2632, #2673, #2842, #2717, #2825, #2765, #2766, #2726 | helpers | bug | 28 (24) | M | Client behavior (types) | Several ready PRs. #2650 makes markers opt-in; pick one design in an ADR, then take the tuple / null / brand fixes |
| 11 | Empty error body: `error` is `undefined` on 4xx/5xx without content | #2530, #2291, #2531, #2762, #2463, #2070, #2829, #2234, #2464 | fetch, react-query | bug | 20 (20) | M | Client behavior | Users miss errors with `if (error)`. #2762 changes the runtime value → opt-in or ADR. The react-query side (#2829) is a pure fix |
| 12 | String and `text/plain` request bodies are JSON-encoded twice | #2555, #2761, #2382 | fetch | bug | 1 (1) | S | Client behavior | Today `"abc"` is sent as `"\"abc\""`; very likely nobody relies on it, still list it as a difference |
| 13 | Deterministic middleware request ID instead of `Math.random()` | #2486, #2763 | fetch | bug | 2 (2) | S | No | Fixes Next.js prerender warning |
| 14 | Cross-realm `instanceof Function` check in body serializer | #2637 | fetch | bug | 0 (0) | S | No | One-line fix, breaks Jest VM modules today |
| 15 | Reject `..` path segments in path params | #2483 | fetch | security | 0 (0) | S | Client behavior | Hardening; fits task 7.6. Default-on needs an ADR, otherwise opt-in |
| 16 | `format: binary` as `Blob` (file upload) | #1214, #2878 | generator | feature | 48 (48) | M | Yes → opt-in | #2878 already adds `--binary-as-blob` (default off) |
| 17 | OpenAPI 3.2 baseline: `itemSchema`, HTTP `QUERY` | #2577, #2683, #2853, #2844 | generator, fetch | feature | 36 (32) | M–L | No for 3.0 / 3.1 schemas | New output only for 3.2 documents. Out of 1.0 non-goals? Only if it stays additive; decide in Phase 7 planning |
| 18 | `allOf` member with only `required` gives `Record<string, never>` | #1474, #1520, #2165, #2850, #2858 | generator | bug | 13 (5) | M | Yes → opt-in | Long-standing (since 2024); many duplicates |
| 19 | `anyOf` with sibling `properties` becomes a union instead of an intersection | #2380, #2608 | generator | bug | 3 (3) | S | Yes → opt-in | Today's output is wrong but compiles |
| 20 | `$defs` emitted as a required property | #2664, #2835 | generator | bug | 0 (0) | S | Yes → opt-in | Forces users to pass `$defs` in bodies |
| 21 | `--array-length` tuple bugs (`minItems: 1`, nested, min..max range) | #2048, #2330, #2546 | generator | bug | 3 (1) | S | Yes → opt-in | Only affects users of `--array-length`, but changes their output |
| 22 | `unevaluatedProperties` support | #2839, #2880 | generator | feature | 0 (0) | M | Yes → opt-in | Today emits `Record<string, never>` |
| 23 | react-query type fixes: `select` inference, infinite-query key collision, `initialPageParam: undefined`, query options in fetch init, undeclared params | #2852, #2873, #2882, #2184, #2671, #2715, #2826, #2340, #2642, #2857, #2864, #2865 | react-query | bug | 4 (3) | M | Client behavior (types) | All have ready PRs. #2857 and #2865 make types stricter and can break compiling code → opt-in or major-version note |
| 24 | CJS consumers cannot find types / `require` fails | #2047, #2155, #2342 | generator | bug | 3 (3) | S | No | Packaging; checked by attw in CI |
| 25 | Optional properties / params with `default` generated as required | #2012, #2319, #1957, #1903 | generator | bug | 21 (21) | M | Yes → opt-in | High demand, but it is a design question: `--default-non-nullable` (on by default since v7) causes it on purpose for responses. Needs a request-vs-response split behind a flag |
| 26 | Discriminator value conflict: a schema named by a parent `mapping` and by a discriminated `oneOf` gets both values (`kind: "Cat" & kind: "cat"`, so `never`) | found in pre-beta test plan 10.6 | generator | bug | 0 (0) | S | Yes → opt-in | Root cause: pass 2 of `findDiscriminators` patches refs that pass 1 handled. The repeated `--enum` declaration it caused is fixed (PB-34); the conflicting values are valid output, so the fix waits for opt-in |

**Not taken now, but worth tracking:** status-code narrowing in fetch (#1970, 19 reactions, conflicts with the
current client API — a 2.0 topic); `as const` enum objects and enum + union output (#2366, #941; opt-in flags,
M effort); tag / path filtering (#1922, #2836); `--type-mappings` / `Date` types (#2373, #2237); response status
and headers in react-query (#2257, #2127, #2383, #2238 — one design for all four); react-query
`mutationOptions` / `infiniteQueryOptions` (#2487, #2484 — ready PRs, additive).
