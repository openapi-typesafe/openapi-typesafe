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
