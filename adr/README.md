# Architecture Decision Records

An ADR records one systemic decision: architecture, dependencies, supported versions, release process, or a
breaking change. Day-to-day choices belong in pull requests, not here.

## Rules

- One decision per file: `NNN-short-title.md`, numbered in order. Start from [`000-template.md`](./000-template.md).
- An accepted ADR is not rewritten. To change a decision, write a new ADR that supersedes it and set the old one's
  status to `Superseded by ADR-NNN`.
- Every ADR names a **review trigger**: the event that makes us look at the decision again.

## Index

| ADR | Title | Status |
|---|---|---|
| [001](./001-fork-with-full-history.md) | Fork with full history | Accepted |
| [002](./002-type-ir-and-string-printer.md) | Own Type IR and string printer instead of the TypeScript compiler API | Accepted |
| [003](./003-dependency-policy.md) | Dependency policy and initial dependency review | Accepted |
| [004](./004-legacy-ts-node-callbacks.md) | Legacy `ts.Node` callbacks and `stringToAST` | Accepted |
| [005](./005-schema-loader.md) | Keep Redocly 1.34.x as the schema loader for 1.0 | Accepted |
| [006](./006-supported-versions.md) | Supported TypeScript and Node versions, strict compiler flags rollout | Accepted |
| [007](./007-release-provenance-and-name-reservation.md) | Release, provenance and npm name reservation | Accepted |
| [008](./008-client-source-language.md) | Client source language | Accepted |
| [009](./009-react-query-exact-optional-property-types.md) | `exactOptionalPropertyTypes` is off for openapi-typesafe-react-query | Accepted |
| [010](./010-cli-prints-ir-before-node-api.md) | The CLI prints with our printer before the Node API switches to IR | Superseded by ADR-004 |
| [011](./011-typed-errors-and-exit-codes.md) | Typed errors with stable codes, and CLI exit codes | Accepted |
| [012](./012-composition-roots-and-ports.md) | Composition roots and ports for the CLI and the Node API | Accepted |
| [013](./013-client-behavior-fixes.md) | Client behavior fixes for 1.0 | Accepted |
| [014](./014-readable-writable-shape-preservation.md) | `Readable` / `Writable` keep shapes instead of an opt-in flag | Accepted |
| [015](./015-migration-tool-parser.md) | The migration tool parses sources with `@typescript/typescript6` | Accepted |
| [016](./016-one-version-line.md) | One version line for the published packages | Accepted |
| [017](./017-ref-access-limits.md) | Opt-in limits for local and remote `$ref` | Accepted |
| [018](./018-keep-wildcard-exports.md) | Keep the `./*` export of the upstream packages in 1.x | Accepted |
| [019](./019-identifier-characters-follow-typescript.md) | Identifier characters follow TypeScript's tables, not the runtime's Unicode | Accepted |
| [020](./020-openapi-3-2-types.md) | OpenAPI 3.2 features are typed by default, next to the 3.1 output | Accepted |
| [021](./021-opt-in-output-fixes.md) | Opt-in output fixes are named values of one `fix` option | Accepted |
| [022](./022-react-query-fixes.md) | react-query fixes for 1.0, and stricter types for 2.0 | Accepted |
| [023](./023-inline-source-refs-resolve-in-cwd.md) | Relative `$ref`s of an inline source resolve in `cwd` | Accepted |
| [024](./024-discriminator-output-fixes.md) | Discriminator fixes: one default for output that does not compile, one name per construct | Accepted |
| [025](./025-client-fixes-for-rc1.md) | Client fixes for 1.0.0-rc.1, and two more type changes for 2.0 | Accepted |
| [026](./026-ref-pointer-types.md) | Types of `$ref` pointers into schema keywords | Accepted |
| [027](./027-enum-values-and-discriminator-checks.md) | Checked `--enum-values` types, discriminator value warnings, required-only variants | Accepted |
| [028](./028-path-template-overlaps.md) | `--path-params-as-types` overlaps move a template only on a proven error | Accepted |
| [029](./029-ci-job-timeouts.md) | A time limit on every CI job | Accepted |
| [030](./030-client-fixes-from-rc1-acceptance.md) | Client fixes from the rc.1 acceptance tests | Accepted |
| [031](./031-ref-resolution-check.md) | A `$ref` resolution check before Redocly lints and bundles | Accepted |
| [032](./032-compiler-types-from-the-installed-typescript.md) | Public declarations read compiler types from the installed `typescript` | Accepted |
| [033](./033-remote-ref-hardening.md) | Remote `$ref` loading is hardened by default | Accepted |
| [034](./034-what-semver-covers-in-1x.md) | What the semver contract of 1.x covers | Accepted |
| [035](./035-dev-only-advisories-we-accept.md) | Dev-only advisories we accept | Accepted |
| [036](./036-inherited-client-code-keeps-its-shape.md) | Inherited client code keeps its shape until 1.1 | Accepted |
| [037](./037-cli-output-keeps-the-upstream-symbols.md) | CLI output keeps the upstream symbols | Accepted |
| [038](./038-sharded-full-compatibility-run.md) | The full compatibility run is split into 16 shard jobs | Accepted |
| [039](./039-external-links-outside-pull-requests.md) | External links of the docs site are checked outside pull requests | Accepted |
| [040](./040-the-1-0-changelog-is-written-for-upstream-users.md) | The 1.0.0 changelog is written for upstream users | Accepted |
| [041](./041-parameter-values-and-json-parse-errors.md) | Parameter values and JSON parse errors (audit finding F7) | Accepted |
| [042](./042-the-docs-site-follows-the-latest-release.md) | The docs site follows the latest release | Accepted |
| [043](./043-cli-output-guard-and-input-checks.md) | The CLI output guard and input checks of the rc.3 hunt | Accepted |
| [044](./044-real-projects-fail-only-as-documented.md) | Real projects fail only as documented | Accepted |
| [045](./045-terminal-output-shows-control-characters-as-escapes.md) | Terminal output shows control characters as escapes | Accepted |
