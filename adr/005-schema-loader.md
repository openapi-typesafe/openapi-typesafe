# ADR-005: Keep Redocly 1.34.x as the schema loader for 1.0

- Status: Accepted
- Date: 2026-11-02

## Context

The generator loads, lints and bundles OpenAPI documents with `@redocly/openapi-core`. The `redocly` option
of `openapiTS()` is typed as a Redocly `Config`, and the CLI reads `redocly.yaml` (including multi-API
`apis` entries): Redocly's config format is part of the drop-in contract.

Task 3.5 ([research/loader-evaluation.md](../research/loader-evaluation.md)) bundled all 1,820 corpus
documents with Redocly 1.34.22 (current lockfile), Redocly 2.72.1 and json-schema-ref-parser 16.0.5:

- Redocly 2.x produces the same bundle as 1.x for 1,813 of 1,817 documents; the 4 others differ only in
  example values, which do not reach generated types. It is 26% faster on the corpus and 44% larger on disk.
- json-schema-ref-parser bundles 120 documents differently, is about 2× slower, and has no linting or
  Redocly config support.
- Redocly 1.34.6 (the fork base) rejects OpenAPI 3.2; 1.34.22 and 2.x accept it. The 1.x line is still
  patched (1.34.22 released 2026-10-22, dist-tag `v1-archive`). The first 1.x release that accepts
  3.2 is 1.34.15 (measured 2026-11-02), so the dependency range starts at `^1.34.22`, the version
  the tests run with; `test/api/dependency-ranges.test.ts` keeps it from going lower.

## Decision

1. The schema loader stays `@redocly/openapi-core`, on the **1.34.x** line, for every 1.x release of
   openapi-typesafe. Patch updates within 1.34.x are taken as regular dependency updates, each verified by
   the compatibility harness.
2. Loading stays behind the `SchemaLoader` port (ENGINEERING_PLAN §4.5), so the loader can change without
   touching transformers.
3. A move to Redocly 2.x is a separate decision (new ADR) for a major version, because it changes the type
   of the public `redocly` option.

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| Keep Redocly 1.34.x (chosen) | Same bundles as the goldens; users' `redocly.yaml` keeps working; OpenAPI 3.2 already supported; still patched | Redocly develops 2.x; 1.x will stop receiving patches at some point |
| Redocly 2.x now | 26% faster; spec-correct example values; the maintained line | Changes the public `redocly` option type (breaking for programmatic users); larger install; not needed for 1.0 |
| json-schema-ref-parser | 2.5 MB, 6 packages | Different bundles for 120 corpus documents; no linting; drops `redocly.yaml` support (breaking) |
| `@scalar/openapi-parser` | Active, OpenAPI-specific | Pre-1.0; same install size as Redocly; no Redocly config support |

## Consequences

- No output change from the loader in 1.0; the harness keeps proving it.
- The OpenAPI 3.2 support gained by the 1.34.22 update is a user-visible improvement and goes into the
  changelog ("OpenAPI 3.2 documents are accepted").
- We carry the 1.x line's install size (17.7 MB) until the 2.x migration.

## Review trigger

Any of: Redocly announces the end of 1.x patches; a security advisory for 1.x without a 1.x fix; work on
openapi-typesafe 2.0 starts; the harness shows a 1.34.x patch changing generated output.

## Reviews

- 2026-11-02 (pre-beta test plan 10.5): GHSA-g3hv-75wg-m249 (minimatch below 11.0.1, published
  2026-10-27) reaches us through `@redocly/openapi-core` 1.34.22, which pins `minimatch` 5.1.9, and has
  no 5.x fix. The denial of service needs an attacker-chosen glob pattern. Redocly 1.x calls `minimatch`
  only to match a URL against the `resolve.http.headers[].matches` patterns of the Redocly config, which
  is a trusted input (threat model T7); a document controls only the URL. The advisory is not reachable
  from a document, so the decision stands. It is listed in `research/backlog.md`, item 2.

## Amendment (2026-11-08): the `redocly` option keeps Redocly 1's `Config` type in 1.x

The public API audit before 1.0 (finding P2-4) pointed out that `redocly?: Config` and
`GlobalContext.redoc: Config` import the type from `@redocly/openapi-core` 1.x. If the 1.x line
stops getting fixes during openapi-typesafe 1.x, decision 3 leaves 2.0 as the only way to move to
Redocly 2. The audit asked for a small structural interface of what the generator reads, which
the `Config` of Redocly 1 and of Redocly 2 would both satisfy, so that the move could be a minor.

We compared the two classes (`@redocly/openapi-core` 1.34.23 and 2.76.0, 2026-11-08):

- Redocly 1's `Config` has `styleguide`, `apis`, `configFile`, `rawConfig` and `resolve`. Redocly
  2's has `rules`, `configPath`, `resolvedConfig`, `resolve` and no `styleguide` or `apis`. Only
  `resolve` is common.
- The generator does not only read fields. The loader passes the object itself to Redocly 1's
  `bundle()`, and its `styleguide` to `lintDocument()`; the CLI reads `apis` and `configFile`.

1. **The type stays Redocly 1's `Config`.** It is honest: the object must be one that Redocly 1
   can use. A type that both versions satisfy would contain only `resolve`, would accept a Redocly
   2 config that then fails at run time, and would not make the move a minor: which objects work
   would still change, and ADR-034 counts that as breaking whatever the type says. `Config` is
   also what openapi-typescript 7.13 declares, so code typed against it (an options object, or a
   read of `ctx.redoc` in a callback) keeps compiling. `unknown` with a run-time check was
   rejected for the same reason and because it breaks those reads.
2. **The risk is accepted for 1.x, with this plan.** The 1.x line is patched under the
   `v1-archive` dist-tag (1.34.24 on 2026-11-08). When an advisory reaches Redocly 1.x, we check
   first whether a document can reach it (as in the 2026-11-02 review); an unreachable one is
   recorded and the decision stands. A reachable one without a 1.x fix, or the end of 1.x
   patches, starts openapi-typesafe 2.0 planning for the move (new ADR, decision 3), which also
   checks the `redocly.yaml` keys that change in Redocly 2. Until then a patch release may work
   around the affected code in the loader, as ADR-031 does with its port of Redocly's resolver (a
   `pnpm patch` would not reach users' installs).
3. `docs/node.md` (Redocly config) says that the option takes a config of
   `@redocly/openapi-core` 1, and that one made with version 2 does not work.

| Option | Pros | Cons |
| --- | --- | --- |
| Keep Redocly 1's `Config` (chosen) | the type says which objects work; upstream-identical | a forced move to Redocly 2 needs a major |
| A structural interface for both versions | the declarations no longer name Redocly 1 | only `resolve` is common; accepts objects that fail at run time; the move still changes which objects work |
| `unknown` and a run-time check | no Redocly type in the declarations | no checks for users; breaks code that reads `ctx.redoc` as upstream types it |

Review trigger: the triggers above, and a user who needs a Redocly 2 config with openapi-typesafe
1.x.
