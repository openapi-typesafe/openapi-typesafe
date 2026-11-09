# ADR-034: What the semver contract of 1.x covers

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
     (internal `RunContext`), and exports and members marked `@internal`, such as
     `IrRawType.origin` and the fetch client's `PathOperation`, which exists for the react-query
     package;
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

## Amendment (2026-11-08): error `details` and the CLI's codes

The public API audit before 1.0 (finding P2-5) asked to either type `details` per code (an
`ErrorDetailsMap` and `OpenAPITypesafeError<C extends ErrorCode>`) or to say that only the
documented keys are stable. Decision 3 already says the second; this amendment records why it
stays and closes two gaps.

1. **`details` stays `Readonly<Record<string, unknown>>`.** Only the keys in the table of
   `docs/node.md` (Errors) are covered by decision 1, with the value types given there:
   `problems` of `SCHEMA_INVALID`, and `ref` and `reason` of `SCHEMA_REF_FORBIDDEN`. A minor
   release may add keys, codes, and values of `reason` (decision 2). A test checks that every
   refusal reason the generator gives is in that table.
2. **The CLI's own codes.** `ErrorCode` also holds the codes that only the CLI raises: those that
   start with `CLI_`, and `OUTPUT_STALE`, `OUTPUT_READ_FAILED` and `OUTPUT_WRITE_FAILED`.
   `openapiTS()` never rejects with them; `docs/node.md` says so. One union keeps the CLI's
   exit-code table exhaustive over every code.

| Option | Pros | Cons |
| --- | --- | --- |
| Documented keys only (chosen) | the contract is the three keys users need; producers can add facts in a patch | `details.problems` is `unknown` until checked |
| A details type per code | each key is typed | freezes every key of the 26 codes for 1.x, also those only logs need; a generic error class makes `isOpenAPITypesafeError` and `catch` blocks harder to type; one code has several shapes (`SCHEMA_REF_INVALID` with `reason: "cycle"` or `"malformed"`) |
| Types for the documented keys only | the three keys are typed | needs the same generic class or a union of error types for three keys |

## Amendment (2026-11-08): the OpenAPI 3.2 types are experimental

Decision 1 covers the generated types. ADR-020 (amendment of 2026-11-08) makes one exception:
the shape of the types generated from the OpenAPI 3.2 keys (`query` operations,
`additionalOperations`, `itemSchema`, `in: querystring`, `components.mediaTypes`) may change in a
minor release, with a changeset that says so, until it is declared final (at the latest in 2.0).
The output of documents without these keys stays covered by decision 1. This is the only
experimental part of 1.x; a new one needs its own ADR.

## Amendment (2026-11-09): the client exports the helper types

The type hunt before rc.4 (T5) found that a library built with `declaration: true` under pnpm or
Yarn PnP failed with TS2742 on hooks and generic wrappers: their inferred types print helper types
such as `FilterKeys`, and `openapi-typesafe-helpers` is a dependency of the client and the hooks,
not of the library, so TypeScript found no specifier for it. openapi-fetch 0.17 and
openapi-react-query 0.5.4 fail the same way for the hooks.

1. `openapi-typesafe-fetch` re-exports every type of `openapi-typesafe-helpers`
   (`export type * from`). TypeScript then names them as `import("openapi-typesafe-fetch").…`. The
   names are covered by decision 1 as the client's own exports are; a name the client declares
   itself wins, and none is shared today.
2. The hooks do not re-export them: `openapi-typesafe-fetch` is a peer dependency of
   `openapi-typesafe-react-query`, so every library that uses the hooks has it, and TypeScript names
   the helper types of a hook through it. One set of names stays one place to look.
3. `test/exports/portable-declarations.test.ts` (fetch) and `test/portable-declarations.test.ts`
   (react-query) emit the declarations of a consumer with the packages in pnpm's layout and fail on
   any diagnostic.

| Option | Pros | Cons |
| --- | --- | --- |
| Re-export the helper types from the client (chosen) | Fixes every inferred type, also of the hooks; one line | Many more exported names in the client |
| Also re-export them from the hooks | The hooks need no peer to name them | The same names in two packages; the peer is required anyway |
| Write the types so that they print only the client's names | No new exports | Every helper type would need a copy in the client; a type the compiler expands still prints helpers |
| Tell users to add `openapi-typesafe-helpers` to their dependencies | No change | A dependency only to name types; the error does not say so |

## Amendment (2026-11-09): the client declares the helper types, and the hooks name them through it

The second type hunt before rc.4 built the libraries of the amendment above under Yarn PnP. Their
declarations still had about 140 `import("openapi-typesafe-helpers")` references, and their users
failed with TS2307: Yarn PnP gives TypeScript a bare specifier for the package that declares a
type, without asking whether the importing package depends on it, so the re-export of decision 1
there was never used. Under pnpm the path of the declaring package goes through the store, so
TypeScript looked for another module and found the re-export. The same hunt found that an
exported `queryOptions` result printed TanStack's `[dataTagSymbol]` keys without an import
(TS2304 for its users, or `any` cached data with `skipLibCheck`), because TanStack's `DataTag` is
a conditional type that TypeScript expands.

1. The published declarations of `openapi-typesafe-fetch` declare the helper types themselves:
   the declaration build inlines the declarations of `openapi-typesafe-helpers`
   (`build.config.ts`), and exports them under the same names. They are the same types: all of
   them are structural (no classes, no unique symbols), so values typed with either package's
   names mix. The client keeps its dependency on the helpers package, because the `src` it ships
   imports it.
2. The hooks import the helper types from `openapi-typesafe-fetch`, so their declarations name only
   the client, and `openapi-typesafe-helpers` is no longer a dependency of the hooks (a dev
   dependency for tests that mix both). This replaces decision 2 of the amendment above where it
   assumed TypeScript would find the client's re-export.
3. The `queryKey` of `queryOptions` is typed with the exported object type
   `QueryKeyWithDataTag<Key, Data, Error>` (`{ queryKey: DataTag<Key, Data, Error> }`), the type
   that TanStack Query exports under that name from 5.102. The peer range starts at 5.80, so the
   hooks declare their own. A named object type prints by name, and the tag keys are never
   spelled out. Decision 1 covers the name.
4. TanStack's own types keep two limits, which the hooks cannot remove: in a library file that
   does not import `@tanstack/react-query`, TypeScript 5.4 under pnpm fails with TS2742 for
   `@tanstack/react-query` and `@tanstack/query-core` (5.5 and later do not), and Yarn PnP prints
   `import("@tanstack/query-core")` for `InfiniteData` and `QueryFunction`, as it does for
   TanStack's own hooks. The react-query docs ("Libraries that export hooks") give the fixes: an
   import from `@tanstack/react-query` in that file, or an annotation; under PnP also a dependency
   on `@tanstack/query-core`.
5. `test/exports/portable-declarations.test.ts` (fetch) checks that the published declarations
   hold no `openapi-typesafe-helpers` import. `test/portable-declarations.test.ts` (react-query)
   checks the same for the hooks, emits a library that exports a `queryOptions` result, and
   type-checks a user of its declarations with `skipLibCheck: false`.

| Option | Pros | Cons |
| --- | --- | --- |
| Inline the helper declarations into the client's (chosen) | Every inferred type names the client, under npm, pnpm and Yarn PnP; no copy to keep by hand | The client's declarations are about 300 lines longer |
| Keep the re-export only | No build change | Yarn PnP libraries keep failing for their users |
| Make the helpers a peer of the client | TypeScript could name it | Every user installs a third package only to name types |
| Use TanStack's `QueryKeyWithDataTag` | One name | Needs `@tanstack/react-query` 5.102; the peer range starts at 5.80 |

## Amendment (2026-11-09): one declaration of the helper types, in the client

The recheck of the amendment above found that its decision 1 did not hold: the client's copies of
the helper types and those of `openapi-typesafe-helpers` mixed only for concrete types. In generic
code TypeScript compares two mapped or conditional types by declaration, not by shape: a mapped
type with an `as` clause, as `Readable` and `Writable` are, or a conditional type whose `extends`
type is another conditional type. So `Readable<T>` of one package was not assignable to
`Readable<T>` of the other, and `Writable<OperationRequestBodyContent<O>>` failed even after `Readable` was
rewritten without the `as` clause. Copies cannot be the same type; only one declaration can.

1. `openapi-typesafe-fetch` declares the helper types (`src/helpers.ts`), and its index re-exports
   them. Its declaration build no longer inlines another package, and it no longer depends on
   `openapi-typesafe-helpers`: the client has no runtime dependency, the target of ADR-003
   decision 1.
2. `openapi-typesafe-helpers` re-exports them from `openapi-typesafe-fetch`, which becomes its
   dependency. The names are listed (`export type { … } from`): rollup-plugin-dts 6.5.1 turns
   `export type * from` of another package into `export * from`, which would also declare the
   client's functions in a package without runtime code. `test/exports.test.ts` of the helpers
   checks the list against the client's declarations, and `test/generic-mixing.test.ts` checks
   that generic code mixes the names of both packages.
3. Types inferred from the client or the hooks keep printing `openapi-typesafe-fetch`, under npm,
   pnpm and Yarn PnP. A library under pnpm that depends only on the helpers gets
   `import("openapi-typesafe-helpers")`, as TypeScript finds the re-export. Under Yarn PnP such a
   library gets `import("openapi-typesafe-fetch")` for a helper type that a file prints without
   importing it, which its users cannot resolve (TS2307); the helpers README and the client's API
   docs give the fixes: a dependency on `openapi-typesafe-fetch`, or an annotation.
4. The `Readable` and `Writable` that `--read-write-markers` writes into a generated file stay a
   separate declaration (ADR-014: generated files depend on no package), compared by text with the
   client's (`test/api/read-write-marker-types.test.ts`). They mix with the client's names for
   concrete types only.

| Option | Pros | Cons |
| --- | --- | --- |
| Declare the types in the client; the helpers re-export them (chosen) | One declaration: the names mix everywhere; client and hooks libraries portable under every package manager | The helpers depend on the client; a helpers-only library under Yarn PnP that prints a helper type needs the client as a dependency |
| Keep the copies (the amendment above) | No dependency change | Generic code that mixes the names fails (TS2322) |
| Declare the types in the helpers; the client imports them | The helpers stay standalone | Libraries that use the client fail under Yarn PnP again (about 270 `import("openapi-typesafe-helpers")` per library) |
| Make the helpers a peer of the client | One declaration | Every user installs a third package only to name types (rejected above) |

## Amendment (2026-11-09): the helper types in their own entry of the client

The full compatibility run checks 22 open-source projects as they are, switched by package name
only. Two of them failed on the amendment above:

- unsplash-js writes `export type * from "openapi-fetch"` next to `export type * from` a file
  that declares its own `ErrorResponse`. openapi-fetch exports no helper type, so this compiled;
  the client's index re-exported them all, so the two `ErrorResponse` failed with TS2308.
- coderabbit-bitbucket imports `InitParam` from `openapi-fetch/src/index.js`. openapi-fetch's
  `src/index.d.ts` has no export list, and a declaration file without one exports all of its
  top-level types. The re-export of decision 1 was an export list, so every type that the file
  does not mark `export` (`InitParam`, `BodyType`, the middleware callbacks) stopped resolving.

Decision 1 changes: the helper types keep their one declaration in the client (`src/helpers.ts`),
but in a second entry, `openapi-typesafe-fetch/helpers`, with its own declaration files and an
empty runtime file so that `import` and `require()` of it resolve. The client's declarations import
them from it and do not export them. TypeScript names a type by a package path that resolves to
its declaration file, so types inferred from the client print
`import("openapi-typesafe-fetch/helpers")`, of a package that a library using the client depends
on; no re-export is needed. `src/index.d.ts`
again has no export list. `openapi-typesafe-helpers` re-exports the entry with `export type *`: the
declaration build turns it into `export *`, which is the same for an entry without runtime code,
so the list of names of decision 2 goes. Tests check that the main entry exports no helper type,
that every top-level type of `src/index.d.ts` is exported, and that a library under pnpm names the
helper types through the new entry.

| Option | Pros | Cons |
| --- | --- | --- |
| A `helpers` entry of the client (chosen) | One declaration; inferred types name a package the library depends on; the main entry and `src/index.d.ts` export what openapi-fetch's do | One more entry of the client, without runtime code |
| Keep the re-export from the index | No change | `export type *` of the client next to a same-named type fails (TS2308); unmarked types of `src/index.d.ts` stop resolving |
| Mark every type of `src/index.d.ts` `export` | Deep imports resolve | The main entry exports the internal types too, and the helper names still collide |
| Declare the types in the helpers; the client imports them | The helpers stay standalone | Libraries that use the client fail under pnpm and Yarn PnP (rejected above) |

## Amendment (2026-11-09): nothing installs the helpers for code that does not list them

A third project of the run, permit-cli, imports `openapi-typescript-helpers` without listing it:
openapi-fetch and openapi-react-query depend on it, so npm installs it next to them. After the
amendment "one declaration of the helper types, in the client", neither the client nor the hooks
depend on `openapi-typesafe-helpers`, so the switched import fails with TS2307, and every type
that depends on it fails after it. With the package added, the type check passes.

1. This stays as it is: a breaking change for code that imports a package it does not list. The
   Major changes of the client and the migration guide name it with its fixes: a dependency on
   `openapi-typesafe-helpers`, or an import from `openapi-typesafe-fetch/helpers`.
2. The migration tool reports each such import: a renamed import of `openapi-typesafe-helpers` in a
   source file that no `package.json` at or above it lists, under the old or the new name. A file
   that no manifest contains is not judged, and a manifest that cannot be read counts as listing
   every package. It reports and does not add the dependency, as for the other dependencies the
   user must decide on (the version, the field, the workspace that should own it).
3. permit-cli is an expected failure of the run at its type check (ADR-044).

| Option | Pros | Cons |
| --- | --- | --- |
| Name the break, report the import (chosen) | The client keeps no runtime dependency; the user gets the fix with the file and line | Code that relied on the old package's dependency needs one line of `package.json` |
| The client depends on the helpers again | Such code keeps working | A dependency cycle (the helpers depend on the client), and a runtime dependency of the client only for types |
| The migration tool adds the dependency | No manual step | The tool would pick the version, the field and the workspace; a `package.yaml` or a catalog has no safe place to add it |

## Review trigger

A user reports a deep upstream path that no longer resolves, a change that this ADR classifies
as non-breaking breaks a real project, or the 2.0 planning starts. For the declarations: the peer
range of `@tanstack/react-query` starts at 5.102 (then `QueryKeyWithDataTag` can alias
TanStack's), or TypeScript names re-exported types under Yarn PnP. For the helpers package: a
user reports a helpers-only library under Yarn PnP. For the client: a project that passes on
openapi-fetch fails on an export name of either entry.
