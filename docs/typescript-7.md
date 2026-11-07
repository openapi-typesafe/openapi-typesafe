---
title: TypeScript 7
description: Why openapi-typescript fails with TypeScript 7, and how openapi-typesafe works with it
---

# TypeScript 7

TypeScript 7 is the native port of the compiler. Its `typescript` package has no JavaScript API: there is no `ts.factory` and no printer. openapi-typescript 7 builds every type with `ts.factory` and prints it with the TypeScript printer, so it cannot run in a project that installs TypeScript 7.

openapi-typesafe builds types as its own small tree and prints them itself. It needs no `typescript` package, so it runs next to TypeScript 7, 6 or 5.

## The errors

If you landed here from a search, these are the errors openapi-typescript 7.13 gives with `typescript` 7.0.

### When installing

npm refuses to install, because openapi-typescript has a peer dependency on TypeScript 5:

```txt
npm error code ERESOLVE
npm error ERESOLVE unable to resolve dependency tree
npm error
npm error While resolving: my-project@1.0.0
npm error Found: typescript@7.0.2
npm error node_modules/typescript
npm error   typescript@"7.0.2" from the root project
npm error
npm error Could not resolve dependency:
npm error peer typescript@"^5.x" from openapi-typescript@7.13.0
```

pnpm installs, with a warning; `pnpm peers check` shows the cause:

```txt
✕ unmet peer typescript
  Installed: 7.0.2
  Wanted:
    ^5.x:
      openapi-typescript@7.13.0
```

### When generating

With `--legacy-peer-deps`, `--force`, pnpm, or any other way past the install, the CLI and the Node API both crash as soon as the module loads:

```txt
file:///…/node_modules/openapi-typescript/dist/lib/ts.mjs:11
const BOOLEAN = ts.factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword);
                           ^

TypeError: Cannot read properties of undefined (reading 'createKeywordTypeNode')
```

Pinning `typescript` to 5.x or 6.x for the whole project is the only fix within openapi-typescript.

## The fix

Switch to openapi-typesafe. It is a drop-in successor: the same flags, Node API and types (only the header comment differs).

```bash
npx openapi-typesafe-migrate --write
```

See the [migration guide](/migration-guide) for what the tool changes and the one regenerated-file commit it needs.

## Callbacks that use TypeScript nodes

The Node API options `transform`, `postTransform` and `transformProperty` may build types with `ts.factory`, as in openapi-typescript. Such callbacks still need a TypeScript JavaScript API. In a TypeScript 7 project, install TypeScript 6 under its own name next to it:

```bash
npm i -D @typescript/typescript6
```

::: warning npm links `tsc` to TypeScript 6
`@typescript/typescript6` depends on `@typescript/old` (TypeScript 6), which also has a `tsc`
command. npm puts that one in `node_modules/.bin`, so `npx tsc` and the `tsc` of your scripts run
TypeScript 6.0 without a warning. pnpm and bun keep TypeScript 7. With npm, also install
TypeScript 7 under a name that npm links first:

```bash
npm i -D @typescript/native@npm:typescript@7
```

Check with `npx tsc -v`.
:::

Without `typescript` 6 or earlier, and without `@typescript/typescript6`, the run fails with an `OpenAPITypesafeError` whose `code` is `TYPESCRIPT_NOT_FOUND`:

```txt
A callback or helper uses TypeScript compiler nodes, which needs the TypeScript JavaScript API. Install "typescript" version 6 or earlier, or "@typescript/typescript6" on TypeScript 7, or use IR callbacks (irCallbacks: true).
```

The better fix is to move the callbacks to [IR callbacks](/node#ir-callbacks), which need no compiler: with `irCallbacks: true`, a callback returns plain type text such as `"Date | null"`. The migration tool rewrites a `transform` that only returns `ts.factory` types for you.

## Type-checking the declarations

The package's declarations type-check with TypeScript 7 and `skipLibCheck: false`. The types of
the compiler-node forms (`ts.Node`, `ts.TypeNode` and the others in the `transform`,
`postTransform` and `transformProperty` options, `astToString` and the `ts*` helpers) are read
from the `typescript` package you have installed. With TypeScript 5 or 6 they are its own node
types. TypeScript 7 has no node types, so there they are `any`: a callback that builds nodes with
`@typescript/typescript6` compiles, and the IR callbacks (`irCallbacks: true`) keep their full
types.

Four errors remain with `skipLibCheck: false`, on every TypeScript version, and come from the
schema loader, `@redocly/openapi-core` 1.34. Its declarations import `json-schema-to-ts` and
`js-yaml`, whose types it does not install:

```txt
node_modules/@redocly/openapi-core/lib/config/types.d.ts(6,33): error TS2307: Cannot find module 'json-schema-to-ts' or its corresponding type declarations.
node_modules/@redocly/openapi-core/lib/js-yaml/index.d.ts(1,47): error TS7016: Could not find a declaration file for module 'js-yaml'.
```

openapi-typescript 7.13 has the same errors. Install the two as development dependencies
(`npm i -D json-schema-to-ts @types/js-yaml`), or keep `skipLibCheck: true`.
