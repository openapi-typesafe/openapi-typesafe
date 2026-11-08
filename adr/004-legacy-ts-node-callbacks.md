# ADR-004: Legacy `ts.Node` callbacks and `stringToAST`

- Status: Accepted
- Date: 2026-11-02

## Context

ADR-002 replaces TypeScript compiler nodes with our own Type IR, so that the generator runs without the
`typescript` package (TypeScript 7 has no JavaScript compiler API). The inherited Node API is built on
`ts.Node`. Research task 3.1 ([research/node-api-usage.md](../research/node-api-usage.md)) sampled
1,124 files in 1,010 repositories that import the original package:

- **826 repositories** use `astToString(await openapiTS(…))`, mostly with `COMMENT_HEADER`. Exported types
  (`OpenAPI3`, `SchemaObject`, …) are imported by 134.
- **`transform`** is used by 319 repositories. Of 231 files on version 7, 176 return a `ts.TypeNode`: 80 build
  it with `ts.factory` only, 60 mix `ts.factory` with our helpers or constants, 7 use only our helpers, 15
  return a `TransformObject`. Users include projects above 20k stars (TabbyML/tabby, InvokeAI, marimo) and
  two published tools that forward user callbacks (`@openapi-qraft/openapi-typescript-plugin`,
  `nuxt-open-fetch`).
- **`postTransform`** (~14 repositories) and **`transformProperty`** (4) also *receive* a node; their users
  inspect it with `ts.is*` and rebuild it with `ts.factory.update*`.
- Exported helpers and constants: 16 repositories; exported transformers: 7 (re-entry through
  `options.ctx`, then `ts.factory.update*`); `stringToAST`: 4.
- About 100 repositories return strings from callbacks: that is the version 6 API, not a 7.x drop-in case.

Two facts constrain the design. A `ts.Node` can only come from a TypeScript ≤ 6 JavaScript API, so a user
who returns one has such a package installed. And `SyntaxKind` numbers differ between TypeScript versions,
so a node can only be read with the same `typescript` module that created it.

## Decision

1. **Unchanged, no warning:** `openapiTS()` returns IR declarations and `astToString()` prints them, so
   `astToString(await openapiTS(…))` and `COMMENT_HEADER` work as before. Exported type names stay.
2. **Helpers and constants** (`tsUnion`, `tsLiteral`, `tsRecord`, `NULL`, `STRING`, …) keep their names and
   call signatures and return IR nodes (task 6.2). They also accept `ts.TypeNode` arguments, which the bridge
   converts.
3. **A one-way bridge reads `ts.Node` results into IR** (`adapters/type-ast-bridge/`). It walks the node tree
   structurally with the user's own `typescript` module and maps every construct the IR has. Objects with a
   string `kind` inside the tree are our IR nodes (users pass `NULL` into `ts.factory` calls) and are taken
   as they are. A subtree with no IR equivalent is printed with the user's TypeScript printer and kept as a
   `raw` IR node.
4. **The bridge loads `typescript` lazily**, only when a callback returns or must receive a `ts.Node`. It
   resolves `typescript` from the user's project, then `@typescript/typescript6`. When neither is found the
   run fails with an error that names both packages. The module is passed to the bridge as a dependency,
   never imported by other layers (enforced by dependency-cruiser).
5. **`transform` returning a `ts.TypeNode`** (directly or in `TransformObject.schema`) keeps working through
   the bridge and logs one deprecation warning per run with a link to the IR recipe.
6. **`postTransform` and `transformProperty`** are deprecated. In 1.x the generator converts the IR to
   `ts.Node` (the existing IR → `ts.factory` conversion), calls the callback, and reads the result back
   through the bridge, with a deprecation warning. New IR-based callbacks with the same names are offered
   behind the `irCallbacks: true` option (task 6.3). An option is needed because the generator cannot tell
   from a function which node type it expects to receive; results, in contrast, are detected by shape. The
   `ts.Node` forms and the option are removed in 2.0, when IR becomes the only form.
7. **`stringToAST`** keeps its behavior through the bridge in 1.x, with a deprecation warning that points
   to `raw` IR nodes. It is removed in 2.0.
8. **Exported transformers** keep their names and signatures and return IR. Re-entry from inside
   `transform` works when the callback returns that IR. Editing the result with `ts.factory.update*` is not
   supported; the migration guide shows the IR equivalent.
9. **Rare exports** with 0–1 real importers (`tsModifiers`, `tsPropertyIndex`, `tsEnum`, `tsEnumMember`,
   `tsArrayLiteralExpression`, `tsDedupe`, `tsIsPrimitive`, `tsReadonlyArray`, `addJSDocComment`,
   `QUESTION_TOKEN`, `enumCache`, `resolveRef`, `scanDiscriminators`, `walk`, `c`, `debug`, `warn`,
   `error`) stay exported in 1.x and are marked `@deprecated`. `enumCache` becomes an empty, unused `Map`
   (the enum registry moves into the transform context). All are removed in 2.0.
10. **Version 6 string callbacks** are out of scope. The migration guide mentions them; no code supports them.

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| Chosen: IR everywhere, lazy one-way bridge, deprecations | Generator runs without TypeScript; every measured 7.x pattern keeps working; cost of the bridge is paid only by users who return `ts.Node` | Bridge must track every IR construct; `postTransform` and `transformProperty` need both directions until 2.0 |
| Keep `ts.Node` as the public node type | No bridge; 100% source compatibility | `typescript` stays a required dependency, which defeats ADR-002 and the TypeScript 7 goal |
| Bridge by printing every returned node to text (`raw` only) | Simplest bridge | Loses structure: our helpers cannot dedupe or parenthesize such nodes, and a tree with our IR constants inside cannot be printed by the TypeScript printer |
| Drop `ts.Node` callbacks in 1.0 | No bridge code | Breaks 176 sampled 7.x files, at least three projects above 20k stars and two published plugins |

## Consequences

- The bridge is the only code that touches a `typescript` module. It needs its own tests against TypeScript
  5.9, 6.x and `@typescript/typescript6` (task 6.4).
- Helpers must accept mixed input (IR and `ts.TypeNode`). That is one conversion at the helper boundary.
- Users who edit generator results with `ts.factory.update*` (compozy, shopware) must migrate in 1.x. The
  Phase 8 real-project check covers both projects, plus TabbyML/tabby, InvokeAI, marimo, supabase/mcp,
  openmeter, andesine and the Qraft plugin, which together use every callback style found in 3.1.
- 2.0 removes the deprecated forms and the bridge's reverse direction.
- Callback nodes that the IR cannot model become `raw` text. While output is still printed by TypeScript
  (Phase 5), the raw node keeps the original node and gives it back, so output is unchanged. Once our
  printer prints the output (Phase 5, step 7), raw text is re-indented line by line at its position, as
  TypeScript indents a nested node. Known limit: that also indents the continuation lines of a template
  literal type that spans lines, which TypeScript keeps verbatim. Step 7 lists it in the compatibility
  report's known differences.
- A root type (`$defs`) is written as an interface only when its IR type is an object with members. If the
  `transform` callback returns a type literal for the `$defs` root that the bridge keeps as `raw` (members
  the IR has no node for), the root becomes `Record<string, never>` instead of an interface with those
  members. No sampled project does this; the Phase 8 check confirms it.

- The deprecated `QUESTION_TOKEN` constant is a TypeScript node, but importing the package must not need
  TypeScript. It is a proxy that creates the token on first use (`adapters/type-ast-bridge/lazy-node.ts`);
  the factory and the printer see a normal node. It goes away with the constant in 2.0.
- The bridge gets the TypeScript module as an argument from `loadTypeScript()`, which resolves it at the
  call through Node's module cache. No module keeps a loaded compiler in its own state.

## Amendment (2026-11-08): one deprecation channel

The public API audit before 1.0 (finding P2-6) found two channels for the deprecations of
decisions 5 to 7. `stringToAST` emitted a Node.js `DeprecationWarning` with the code
`OPENAPI_TYPESAFE_DEP_STRING_TO_AST` (exported as `STRING_TO_AST_DEPRECATION_CODE`). The callback
forms printed a warning line through the run's logger with the warning code
`LEGACY_CALLBACK_DEPRECATED`, which `silent` hid and `node --no-deprecation` did not.

1. **Every runtime deprecation of something 2.0 removes is a Node.js `DeprecationWarning`** with
   an `OPENAPI_TYPESAFE_DEP_*` code, emitted through `util.deprecate`, so Node shows each code
   once per process. The codes are `OPENAPI_TYPESAFE_DEP_STRING_TO_AST`,
   `OPENAPI_TYPESAFE_DEP_TS_TRANSFORM`, `OPENAPI_TYPESAFE_DEP_TS_POST_TRANSFORM` and
   `OPENAPI_TYPESAFE_DEP_TS_TRANSFORM_PROPERTY`, one per form, so that each one is shown. The
   deprecation notices of `fix` in 2.x (ADR-021 decision 8) use the same channel.
2. **`DEPRECATION_CODES`** (and the union `DeprecationCode`) is exported next to `ERROR_CODES`
   and `WARNING_CODES`, and is covered like them (ADR-034 decisions 1 and 2: a code keeps its
   meaning, a minor may add codes). `STRING_TO_AST_DEPRECATION_CODE` and the warning code
   `LEGACY_CALLBACK_DEPRECATED` are removed; only rc versions had them.
3. **`silent` does not hide deprecations.** It exists so that the types can go to stdout;
   Node writes warnings to stderr. Node's own switches apply: `--no-deprecation`,
   `--throw-deprecation`, `--trace-deprecation`, `process.on("warning")`.
4. The run reports through a `DeprecationReporter` port (`application/ports/`); the Node.js
   adapter is wired in the composition root, and tests use an in-memory fake. This also amends
   ADR-034 decision 5: where a deprecation has a runtime warning, it is this one.

| Option | Pros | Cons |
| --- | --- | --- |
| Node.js `DeprecationWarning` for all (chosen) | the standard channel; works for functions called outside a run, such as `stringToAST`; tools and CI can filter, trace or fail on it by code | `silent` no longer hides the callback notice |
| The logger and warning codes for all | one list of codes with the other warnings; `silent` hides them | `stringToAST` has no run and no logger, so it would print to the console with no way to turn it off; Node's switches do not work |
| Keep both | no change | two ways to find, filter and silence the same kind of notice |

## Amendment (2026-11-08): `irCallbacks` and the options type names in 2.0

The public API audit before 1.0 (finding P2-7) noted that decision 6 removes the `irCallbacks`
option in 2.0. `{ irCallbacks: true }` would then be an excess-property error for exactly the
users who followed the 1.x advice. The options types also do not line up: `OpenAPITSOptions`, the
upstream name, means only the TypeScript-node form, `OpenAPITSIrOptions` the IR form, and
`GeneratorOptions` the union of both.

This amends decision 6 for 2.0. Nothing changes in 1.x.

1. **`irCallbacks?: true` stays accepted in 2.x** and does nothing, since IR is the only form. It
   gets `@deprecated` in the declarations and a Node.js `DeprecationWarning` with its own
   `OPENAPI_TYPESAFE_DEP_*` code (amendment above). It is removed in 3.0, as ADR-021 decision 8
   does for `fix`. `irCallbacks: false` asks for a form that no longer exists; 2.0 rejects it with
   a typed error that links the migration guide, instead of passing IR nodes to callbacks written
   for TypeScript nodes.
2. **`GeneratorOptions` is the canonical options type**, today and in 2.0. In 1.x it is the union
   of both forms; in 2.0 it is the base options with the IR callbacks and the deprecated
   `irCallbacks?: true`.
3. **Compatibility names.** `OpenAPITSOptions` (openapi-typescript's name) and
   `OpenAPITSIrOptions` keep their 1.x meaning in 1.x. In 2.0 both become `@deprecated` aliases of
   `GeneratorOptions`, so imports keep compiling; they are removed in 3.0. `OpenAPITSBaseOptions`,
   `IrCallbackOptions` and the `Ir*` callback types keep their names. `LegacyCallbackOptions`,
   `LegacyCallbackName` and the TypeScript-node members are removed in 2.0 with the forms they
   describe.
4. `docs/node.md` (Options types) tells users to type options as `GeneratorOptions` and names the
   compatibility names.

| Option | Pros | Cons |
| --- | --- | --- |
| Keep `irCallbacks: true` as a deprecated no-op in 2.x (chosen) | 1.x code that followed the advice compiles on 2.0; one more major to clean up | an option that does nothing for one major |
| Remove `irCallbacks` in 2.0 (decision 6 as written) | smaller 2.0 options | breaks exactly the users who migrated early |
| Make `OpenAPITSOptions` the canonical 2.0 name | upstream's name | its 1.x meaning is the TypeScript-node form, so 2.0 would change what it means |

## Review trigger

- The Phase 8 real-project check finds a 7.x pattern that the bridge cannot convert, or
- TypeScript 7 ships a JavaScript API that can create nodes (then decision 4 needs a third source), or
- the 2.0 planning starts.
