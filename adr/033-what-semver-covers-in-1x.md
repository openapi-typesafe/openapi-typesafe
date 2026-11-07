# ADR-033: What the semver contract of 1.x covers

- Status: Accepted
- Date: 2026-11-06

## Context

From 1.0.0 the five packages follow semver (ADR-016: one version line). `GOVERNANCE.md` says only
that "breaking changes require a new major version"; no document said what is public. Without a
list, everything a user can reach counts as public: about 535 files behind the `./*` export, the
run state on `GlobalContext`, the shape of every IR node, the keys of error `details`, warning and
log texts, and the Node.js floor. Each of them would block a refactor in 1.x or start a debate
about whether a change is breaking (public API audit before 1.0, finding P1-1).

ADR-018 keeps `./*` so that deep imports that work with the upstream packages keep working. The
audit found that 7 deep modules of openapi-typescript 7.13 (`dist/lib/ts`, `dist/lib/utils`,
`dist/lib/redoc`, `dist/transform/index` and others) do not exist in openapi-typesafe, so the
premise holds for the clients but only in part for the generator (finding P1-2). To find out which
deep paths users import, the published code of the 110 dependents in
[`research/dependents.csv`](../research/dependents.csv) was searched on 2026-11-06: the npm
tarballs of the 60 npm rows and the default branches of the 50 GitHub repositories, about 110,000
source files without `node_modules`. GitHub code search was not available.

- 108 of the 110 import one of the four upstream packages by name.
- One deep import was found: `openapi-typescript/src/types` (types only), in
  `@openapi-contrib/openapi-schema-to-json-schema`, which depends on openapi-typescript 5.x.
  `openapi-typesafe/src/types` resolves the same way (the package ships `src/types.ts`): with
  `moduleResolution: node10` it is found, and with `bundler` or `nodenext` it is not found, for
  upstream as for us, because the `./*` target has no extension.
- No other path under `dist/` or `src/` of any of the four packages is imported.

## Decision

1. **Covered by semver.** A minor or patch release does not remove, rename or narrow:
   - the package `exports` entries other than `./*` (today the `.` entry of each library
     package), the names they export and the documented types of those names, including the documented fields of
     `GlobalContext` and the IR node types; and the `bin` names;
   - the CLI flags in `docs/cli.md`, the `x-openapi-ts` keys of `redocly.yaml`, the Node API
     options in `docs/node.md`, and their defaults;
   - the error codes (`ERROR_CODES`), warning codes (`WARNING_CODES`), output fix names
     (`OUTPUT_FIXES`) and exit codes (ADR-011): an existing code keeps its meaning;
   - the generated types: for the same document, options and `fix` list, a release does not
     change the exported types of output that compiles. A change to such output is an opt-in fix
     (ADR-021). Output that does not compile may be fixed in any release.
2. **Growth in a minor.** A minor release may add exports, options, CLI flags, `x-openapi-ts`
   keys, error and warning codes, fix names (which changes what `fix: ["all"]` does, ADR-021
   decision 3), IR node kinds, members of exported unions (`ErrorCode`, `WarningCode`,
   `OutputFix`, `IrType`, `IrDeclaration`, `IrMember`, `IrComment`, `HttpMethod`, …) and optional
   fields of exported interfaces. A new field in a type that users build (options, `GlobalContext`,
   IR nodes) is always optional. Consumers must therefore:
   - give a `switch` over a code or a `kind` a `default` branch, or accept that an exhaustive
     table (`Record<ErrorCode, …>`) stops compiling after an update, which this ADR does not count
     as a breaking change;
   - keep an IR node of an unknown kind as it is, for example return it unchanged from
     `postTransform`;
   - not assume that a list of codes, fixes or kinds is complete.
3. **Not a contract.** These may change in any release:
   - deep import paths through `./*`: ADR-018 keeps them only so that upstream deep imports keep
     resolving, and the migration tool reports them as manual steps;
   - message texts of errors, warnings and notices (decide by `code`), and the CLI's decorated
     output;
   - the keys of an error's `details`, except those the docs list (`problems` of
     `SCHEMA_INVALID`; `ref` and `reason` of `SCHEMA_REF_FORBIDDEN`);
   - log formats: the `DEBUG=openapi-ts:*` lines and the migration tool's `--log` JSON Lines;
   - the text of the generated header (`COMMENT_HEADER`), which names the generator;
   - the run state that the generator keeps on the context object it passes as `options.ctx`
     (internal `RunContext`), and members marked `@internal`, such as `IrRawType.origin`;
   - types that are reachable through public signatures but not exported by name.
4. **Engines.** The Node.js floor rises within 1.x only in a minor release, only for a Node.js
   line that has reached its end of life, and the changeset says so (ADR-006: Node.js 22 reaches
   it on 2027-04-30, then the floor becomes 24). The TypeScript floor for consumers (5.4,
   ADR-006) rises only in a major release.
5. **Deprecation.** A removal waits for a major release. In 1.x a deprecated export or option
   gets `@deprecated` in the published declarations (checked by `scripts/check-exports.sh`) and
   a note in the docs; a runtime warning is optional.
6. **Deep paths.** No upstream deep path that a dependent imports is missing, so no compatibility
   re-export files are added. `./*` stays (ADR-018). If a user reports a deep upstream path that
   no longer resolves, a thin file that re-exports the same names from the entry is added in a
   patch release.
7. `docs/compatibility.md` ("Versioning") states this for users; the READMEs and `GOVERNANCE.md`
   link to it.

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| A written list of what is covered, growth allowed in a minor (chosen) | Every refactor of internals and every new code or node kind is a minor; users know what to rely on | Users must add `default` branches; exhaustive tables can stop compiling on an update |
| Everything reachable is covered | Nothing to explain | Freezes 535 internal file paths, the IR and the run state until 2.0 |
| Closed unions: a new code or node kind is a major | Exhaustive `switch`es stay safe | One new warning code needs 2.0; the IR cannot grow in 1.x |
| Replace `./*` with a list of paths and re-export files | Smaller surface; the publint warning goes away | Breaks deep imports that work today, for no measured user; ADR-018 chose to keep `./*` |
| Add re-export files for all 7 missing upstream modules now | Every upstream deep path resolves | Seven files to keep in 1.x for paths that no dependent imports (YAGNI) |

## Consequences

- An internal refactor that moves files under `dist/` is a patch, not a major.
- A new warning or error code needs a changeset that names it, and a row in `docs/cli.md`.
- A type change that adds a required field to options, `GlobalContext` or an IR node does not
  pass review in 1.x.
- The dependents search covers published code and default branches only; private code may use
  other deep paths. Decision 6 is the way out for them.

## Review trigger

A user reports a deep upstream path that no longer resolves, a change that this ADR classifies
as non-breaking breaks a real project, or the 2.0 planning starts.
