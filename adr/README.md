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
