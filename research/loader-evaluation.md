# Schema loader evaluation (task 3.5)

Date: 2026-11-02. Input for [ADR-005](../adr/005-schema-loader.md).

## Question

The generator loads, lints and bundles documents with `@redocly/openapi-core` (`src/lib/redoc.ts`). Keep it,
move to its 2.x line, or replace it with another loader?

## What the generator uses from Redocly

- `BaseResolver`, `bundle({ dereference: false })`, `lintDocument`, `makeDocumentFromString`, `Source`,
  `createConfig`.
- The **public API exposes Redocly types**: the `redocly` option of `openapiTS()` is a Redocly `Config`, and
  the CLI reads `redocly.yaml` (including the multi-API `apis` section and the `--redocly` flag). Users'
  Redocly config files are part of the drop-in contract.
- Linting with the `minimal` ruleset plus `operation-operationId-unique` as an error: invalid documents fail
  with Redocly's messages.

## Candidates

| Candidate | Version | Weekly downloads | Packages installed | Install size |
|---|---|---|---|---|
| `@redocly/openapi-core` 1.x (current) | 1.34.22 (dist-tag `v1-archive`, still patched: 1.34.21 on 2026-10-13, 1.34.22 on 2026-10-22) | 16.6 M (all versions) | 22 | 17.7 MB |
| `@redocly/openapi-core` 2.x | 2.72.1 (`latest`, 2026-10-29) | (same package) | 22 | 25.4 MB |
| `@apidevtools/json-schema-ref-parser` | 16.0.5 | 26.6 M | 6 | 2.5 MB |
| `@scalar/openapi-parser` | 0.29.19 (pre-1.0) | 4.7 M | 24 | 23.4 MB |

Sizes are `du` of `node_modules` after `pnpm add --ignore-workspace --save-exact <package>` in an empty
directory (`research/loader-evaluation/setup.sh`).

## Corpus run

Every document of the full corpus (1,820 OpenAPI 3.x documents, `tools/compat-harness`) was bundled
(`$ref`s kept, not dereferenced) by each candidate (`research/loader-evaluation/evaluate.mjs`). The SHA-256 of
the bundled JSON is compared with Redocly 1.34.22, the version the generator uses today.

| Candidate | Bundled | Failed | Same bundle as 1.34.22 | Total time | Median | Slowest |
|---|---|---|---|---|---|---|
| Redocly 1.34.22 | 1,817 | 3 | — | 35.3 s | 5 ms | 3.0 s |
| Redocly 2.72.1 | 1,817 | 3 (the same 3) | 1,813 of 1,817 | 26.0 s | 4 ms | 2.3 s |
| json-schema-ref-parser 16.0.5 | 1,818 | 2 | 1,696 of 1,816 | 63.6 s | 4 ms | 28.7 s |

- The 3 failures are corpus artifacts, not loader bugs: two documents reference sibling files that are not
  part of a single-file download, one references an external Atom feed URL.
- **Redocly 2.x vs 1.x:** the 4 different bundles (Shutterstock, SoundCloud, both GitHub descriptions)
  differ only inside `examples[*].value`: 1.x resolves a `$ref` placed inside an example value, 2.x keeps it
  as literal data. The OpenAPI specification says example values are literal, so 2.x is correct. Example
  values do not reach the generated types.
- **json-schema-ref-parser** bundles 120 documents differently (it rewrites internal `$ref` paths to the
  first occurrence of a shared target), is almost 2× slower overall, and has no OpenAPI linting. Replacing
  Redocly with it would also drop the `redocly.yaml` support that users rely on.
- `@scalar/openapi-parser` was installed for the size comparison only: it is pre-1.0 and has the same
  footprint as Redocly without the config compatibility, so it was not run on the corpus.

## OpenAPI 3.2

The fork base pins Redocly **1.34.6**, whose `lintDocument` throws `Unsupported OpenAPI version: 3.2.0`
(`research/loader-evaluation/lint32.mjs`). Redocly **1.34.22** and **2.72.1** lint 3.2 documents. The Phase 1
dependency update moved the lockfile to 1.34.22, so the current build already generates types for the
three OpenAPI 3.2 documents of the corpus, which the fork base and `openapi-typescript@7.13.0` reject. In the
compatibility report these cases show as "golden failed" (not comparable), which is the expected state.

## Conclusions

1. Keep `@redocly/openapi-core`. Its config is part of the public contract and its bundles are what the
   golden outputs were generated from.
2. Stay on the 1.34.x line for 1.0: it is still patched, supports OpenAPI 3.2 since a 1.34.x patch, and
   matches the goldens exactly.
3. Moving to 2.x is attractive (26% faster on the corpus, spec-correct example handling, the line Redocly
   develops), but the `redocly` option exposes the Redocly `Config` type, so the move changes our public
   types. It needs its own ADR and a major version, with the harness run as evidence.
