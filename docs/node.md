---
title: openapi-typesafe Node.js API
description: Programmatic usage and unlimited flexibility.
---

# Node.js API

The Node API may be useful if dealing with dynamically-created schemas, or you’re using within context of a larger application. Pass in either a JSON-friendly object or a YAML or JSON string to load a schema from memory, or a `URL` to load it from a local file or a remote URL.

## Setup

```bash
npm i --save-dev openapi-typesafe
```

Add `typescript` (`npm i --save-dev typescript`) to type-check the generated file; the generator does not need it.

::: info TypeScript is optional

The generator does not need the `typescript` package. Only callbacks or helpers that use TypeScript compiler nodes (the legacy forms, see [IR callbacks](#ir-callbacks)) load it: `typescript` 6 or earlier, or `@typescript/typescript6` in a TypeScript 7 project.

The declarations type-check with TypeScript 5.4 to 7 and `skipLibCheck: false`, except for four errors from the schema loader's own declarations; see [Type-checking the declarations](./typescript-7.md#type-checking-the-declarations).

:::

::: tip Recommended

For the best experience, use Node ESM by adding `"type": "module"` to `package.json` ([docs](https://nodejs.org/api/esm.html#enabling))

:::

## Usage

The Node.js API accepts either a `URL`, `string`, or JSON object as input:

|   Type   | Description                 | Example                                                                                                                          |
| :------: | :-------------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
|  `URL`   | Read a local or remote file | `await openapiTS(new URL('./schema.yaml', import.meta.url))`<br/>`await openapiTS(new URL('https://myapi.com/v1/openapi.yaml'))` |
| `string` | Read dynamic YAML or JSON   | `await openapiTS('openapi: "3.1" … ')`                                                                                           |
|  `JSON`  | Read dynamic JSON           | `await openapiTS({ openapi: '3.1', … })`                                                                                         |

A string that starts with `file://`, `http://` or `https://` is loaded like a `URL`; any other string, a file path included, is parsed as YAML or JSON. To load a file by its path, pass `pathToFileURL(path)` from `node:url`.

It also accepts `Readable` streams and `Buffer` types that are resolved and treated as strings (validation, bundling, and type generation can’t really happen without the whole document).

The Node API returns a `Promise` with the generated declarations as plain IR objects (`IrDeclaration[]`). Each one is a small object with a `kind` (`interface`, `typeAlias`, `enum`, `constArray`, `rawDeclaration`).

To print the declarations, use the `astToString()` helper. It prints IR with the package's own printer; given TypeScript nodes or TypeScript printer options, it falls back to [TypeScript’s printer](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API#re-printing-sections-of-a-typescript-file):

::: code-group

```ts [src/my-project.ts]
import fs from "node:fs";
import openapiTS, { astToString } from "openapi-typesafe";

const ast = await openapiTS(new URL("./my-schema.yaml", import.meta.url));
const contents = astToString(ast);

// (optional) write to file
fs.writeFileSync("./my-schema.ts", contents);
```

:::

### Errors

When generation fails, `openapiTS()` rejects with an `OpenAPITypesafeError`. Each error has a stable `code` (for example `SCHEMA_INVALID` or `SCHEMA_LOAD_FAILED`) and structured `details`; `cause` holds the lower-level error, if any. Decide by `code`: messages are for people and may change. The codes are listed under [CLI exit codes](/cli#exit-codes); `openapiTS()` never fails with the CLI's own codes (those that start with `CLI_` or `OUTPUT_`). A minor release may add codes, so keep a fallback for a code you do not know. Of `details`, only these keys are stable; other keys may change in any release ([Versioning](./compatibility.md#versioning)):

| Code | Key | Type |
| :--- | :-- | :--- |
| `SCHEMA_INVALID` | `problems` | `string[]`: one text per problem found |
| `SCHEMA_REF_FORBIDDEN` | `ref` | `string`: the refused `$ref` as an absolute URL; user info shows as `***` |
| `SCHEMA_REF_FORBIDDEN` | `reason` | `string`: one of `outside-local-root`, `host-not-allowed`, `local-ref-from-remote`, `too-many-remote-documents` (see [Untrusted documents](./advanced.md#untrusted-documents)); a minor release may add reasons |

`details` is typed as `Readonly<Record<string, unknown>>`, so check a value before you use it.

```ts
import openapiTS, { isOpenAPITypesafeError } from "openapi-typesafe";

try {
  await openapiTS(new URL("./my-schema.yaml", import.meta.url));
} catch (error) {
  if (isOpenAPITypesafeError(error) && error.code === "SCHEMA_INVALID") {
    console.error(error.details.problems);
  }
  throw error;
}
```

### Deprecations

These keep working in 1.x and are removed in 2.0:

- `stringToAST()`: return type text from an [IR callback](#ir-callbacks) instead. It needs a
  TypeScript JavaScript API (`typescript` 6 or earlier, or `@typescript/typescript6`).
- The TypeScript-node form of `transform`, `postTransform` and `transformProperty`: use
  [IR callbacks](#ir-callbacks).
- `resolveRef`, `scanDiscriminators`, `walk`, `c`, `debug`, `warn` and `error`, and the TypeScript
  node helpers `addJSDocComment`, `tsArrayLiteralExpression`, `tsDedupe`, `tsEnum`, `tsEnumMember`,
  `tsIsPrimitive`, `tsModifiers`, `tsPropertyIndex`, `tsReadonlyArray`, `QUESTION_TOKEN` and
  `enumCache`: rarely used internals, marked `@deprecated` in the types (no runtime warning).

When one of the first two is used, Node.js prints a `DeprecationWarning` with one of these codes,
once per process for each code. `DEPRECATION_CODES` exports them. Node's own switches work on
them: `node --no-deprecation` hides them, `--throw-deprecation` makes them errors,
`--trace-deprecation` shows where they come from, and `process.on("warning", …)` receives them.
The `silent` option does not hide them.

| Code | Used |
| :--- | :--- |
| `OPENAPI_TYPESAFE_DEP_STRING_TO_AST` | `stringToAST()` is called |
| `OPENAPI_TYPESAFE_DEP_TS_TRANSFORM` | `transform` returns a TypeScript node |
| `OPENAPI_TYPESAFE_DEP_TS_POST_TRANSFORM` | `postTransform` runs without `irCallbacks: true` |
| `OPENAPI_TYPESAFE_DEP_TS_TRANSFORM_PROPERTY` | `transformProperty` runs without `irCallbacks: true` |

### Redocly config

A Redocly config isn’t required to use openapi-typesafe. By default it extends the `"minimal"` built-in config. But if you want to modify the default settings, you’ll need to provide a fully-initialized Redocly config to the Node API. You can do this with the helpers in `@redocly/openapi-core` version 1, the version openapi-typesafe uses (`npm i -D @redocly/openapi-core@1`). A config made with version 2 has another shape and does not work: openapi-typesafe 1.x stays on Redocly 1 ([ADR-005](https://github.com/openapi-typesafe/openapi-typesafe/blob/main/adr/005-schema-loader.md)).

::: code-group

```ts [src/my-project.ts]
import { createConfig, loadConfig } from "@redocly/openapi-core";
import openapiTS from "openapi-typesafe";

// option 1: create an in-memory config
const inMemory = await createConfig({
  extends: ["recommended"],
  rules: { "operation-4xx-response": "off" },
});

// option 2: load it from a redocly.yaml file
const fromFile = await loadConfig({ configPath: "redocly.yaml" });

const ast = await openapiTS(mySchema, { redocly: inMemory });
```

:::

## Options

The Node API takes the generator flags of the [flags table](/cli#flags) in camelCase (`--no-lint` is `lint: false`; `--output`, `--redocly`, `--check`, `--help` and `--version` are CLI only), plus the following options:

| Name               |      Type       |     Default     | Description                                                                                  |
| :----------------- | :-------------: | :-------------: | :------------------------------------------------------------------------------------------- |
| `transform`        |   `Function`    |                 | Override the default Schema Object → TypeScript transformer in certain scenarios             |
| `postTransform`    |   `Function`    |                 | Same as `transform` but runs _after_ the TypeScript transformation                           |
| `transformProperty`|   `Function`    |                 | Transform individual property signatures for Schema Object properties                        |
| `irCallbacks`      |    `boolean`    |     `false`     | Callbacks receive and return IR nodes instead of TypeScript nodes (see [IR callbacks](#ir-callbacks)) |
| `silent`           |    `boolean`    |     `false`     | Print nothing on stderr: no warnings, and no problem lines of a document that fails (the error lists them in `details.problems`). [Deprecations](#deprecations) and `DEBUG` lines still show |
| `lint`             |    `boolean`    |     `true`      | Lint the document with the Redocly config first. `false` skips it; bundling errors still fail |
| `cwd`              | `string \| URL` | `process.cwd()` | The directory that relative `$ref`s of a string, object, buffer or stream source resolve from. A file or URL source resolves from its own location |
| `localRefRoot`     | `string \| URL` |                 | Load local `$ref` files only from this directory and below it; a relative path resolves against `cwd` |
| `remoteRefHosts`   |   `string[]`    |                 | Load remote `$ref` documents only from these hosts (`name` or `name:port`); `[]` allows none |
| `fix`              | `OutputFixName[]` |               | Opt-in fixes of the output, by name, or `["all"]`; see [fix](/cli#fix). `OUTPUT_FIXES` lists them |
| `inject`           |    `string`     |                 | Inject arbitrary TypeScript types into the start of the file                                 |
| `redocly`          |     `Config`    |                 | A Redocly config object; see [Redocly config](#redocly-config). Without it, Redocly's `minimal` config with `operation-operationId-unique` as an error (the CLI makes it a warning); the Node API does not look for `redocly.yaml`
| `version`          |     `number`    |                 | Accepted for compatibility with openapi-typescript; no code reads it

### Options types

To type an options object, use `GeneratorOptions`: it takes either callback form, and it stays the
name of the options in 2.0. `OpenAPITSOptions` (openapi-typescript's name, the TypeScript-node form)
and `OpenAPITSIrOptions` (the IR form) are compatibility names; in 2.0 both become deprecated aliases
of `GeneratorOptions`. In 2.0 `irCallbacks: true` is still accepted and does nothing, with a
deprecation warning, so code that set it in 1.x keeps compiling; it is removed in 3.0.

### IR callbacks

With `irCallbacks: true`, `transform`, `postTransform` and `transformProperty` work on the generator’s own type nodes (IR) instead of TypeScript compiler nodes, and you don’t need the `typescript` package. The TypeScript-node form (`transform` returning a TypeScript node, `postTransform` and `transformProperty` without `irCallbacks`) still works in 1.x, emits a Node.js `DeprecationWarning` (see [Deprecations](#deprecations)), and is removed in 2.0. The examples below use the IR form.

- A type result is an IR type (from the helpers, such as `tsUnion([STRING, NULL])`) or a string of TypeScript type text, printed as written.
- `transform` may also return `{ schema, questionToken: true }` to make the property optional.
- `postTransform(type, options)` receives the generated IR type.
- `transformProperty(property, schemaObject, options)` receives the generated IR property (`name`, `type`, `isOptional`, `isReadonly`, `comments`) and returns a new one.
- Returning `undefined` keeps the generated type or property.

::: code-group

```ts [src/my-project.ts]
import openapiTS, { astToString, NULL, tsUnion } from "openapi-typesafe";

const ast = await openapiTS(mySchema, {
  irCallbacks: true,
  transform(schemaObject) {
    if (schemaObject.format === "date-time") {
      return schemaObject.nullable ? "Date | null" : "Date";
    }
  },
  postTransform(type, options) {
    return options.path?.endsWith("/id") ? tsUnion([type, NULL]) : undefined;
  },
  transformProperty(property) {
    return property.isOptional ? { ...property, isReadonly: true } : undefined;
  },
});
const contents = astToString(ast);
```

:::

#### Building and reading IR

- To build a type, use the helpers and constants (`tsUnion`, `tsIntersection`, `tsLiteral`,
  `tsRecord`, `tsNullable`, `tsOmit`, `tsWithRequired`, `oapiRef`, `STRING`, `NUMBER`, `NULL`,
  `UNKNOWN`, …) or return TypeScript type text as a string. These are the supported ways; the
  constructors inside the package (`dist/domain/ir/…`) are not part of the API.
- To change a property or a type you receive, spread it and replace fields:
  `{ ...property, isReadonly: true }`.
- The node types (`IrType`, `IrPropertySignature`, `IrDeclaration`, …) are exported for reading.
  A minor release may add a node kind, so a `switch` over `kind` needs a `default` branch that
  keeps an unknown node as it is (see [Versioning](./compatibility.md#versioning)).
- `encoding` on a string literal and `origin` on a raw type are printer details: leave
  `encoding` out (the printer writes JSON text) and never set `origin`.

### transform / postTransform

Use the `transform()` and `postTransform()` options to override the default Schema Object transformer with your own. This is useful for providing nonstandard modifications for specific parts of your schema.

- `transform()` runs **before** the conversion to TypeScript (you’re working with the original OpenAPI nodes)
- `postTransform()` runs **after** the conversion to TypeScript (you’re working with the generated IR type)

#### Example: `Date` types

For example, say your schema has the following property:

```yaml
properties:
  updated_at:
    type: string
    format: date-time
```

By default, openapiTS will generate `updated_at?: string;` because it’s not sure which format you want by `"date-time"` (formats are nonstandard and can be whatever you’d like). But we can enhance this by providing our own custom formatter, like so:

::: code-group

```ts [src/my-project.ts]
import openapiTS from "openapi-typesafe";

const ast = await openapiTS(mySchema, {
  irCallbacks: true,
  transform(schemaObject, metadata) {
    if (schemaObject.format === "date-time") {
      return schemaObject.nullable ? "Date | null" : "Date";
    }
  },
});
```

:::

That would result in the following change:

::: code-group

```ts [my-openapi-3-schema.d.ts]
updated_at?: string; // [!code --]
updated_at?: Date; // [!code ++]
```

:::

#### Example: `Blob` types

::: tip
[`binaryAsBlob: true`](/cli#binaryasblob) (`--binary-as-blob`) does this without a `transform`, also for
OpenAPI 3.1 `contentMediaType` and nullable schemas. The example below still shows how a `transform`
works.
:::

Another common transformation is for file uploads, where the `body` of a request is a `multipart/form-data` with some `Blob` fields. Here's an example schema:

::: code-group

```yaml [my-openapi-3-schema.yaml]
Body_file_upload:
  type: object
  properties:
    file:
      type: string
      format: binary
```

:::

Use the same pattern to transform the types:

::: code-group

```ts [src/my-project.ts]
import openapiTS from "openapi-typesafe";

const ast = await openapiTS(mySchema, {
  irCallbacks: true,
  transform(schemaObject, metadata) {
    if (schemaObject.format === "binary") {
      return schemaObject.nullable ? "Blob | null" : "Blob";
    }
  },
});
```

:::

Resultant diff with correctly-typed `file` property:

::: code-group

```ts [my-openapi-3-schema.d.ts]
file?: string; // [!code --]
file?: Blob; // [!code ++]
```

:::

#### Example: Add "?" token to property

It is not possible to create a property with the optional "?" token with the above `transform` functions. The transform function also accepts a different return object, which allows you to add a "?" token to a required property. Here's an example schema:

::: code-group

```yaml [my-openapi-3-schema.yaml]
Body_file_upload:
  type: object
  required: [file]
  properties:
    file:
      type: string
      format: binary
```

:::

Here we return an object with a schema property, which is the same as the above example, but we also add a `questionToken` property, which will add the "?" token to the property.

::: code-group

```ts [src/my-project.ts]
import openapiTS from "openapi-typesafe";

const ast = await openapiTS(mySchema, {
  irCallbacks: true,
  transform(schemaObject, metadata) {
    if (schemaObject.format === "binary") {
      return {
        schema: schemaObject.nullable ? "Blob | null" : "Blob",
        questionToken: true,
      };
    }
  },
});
```

:::

Resultant diff with correctly-typed `file` property and "?" token:

::: code-group

```ts [my-openapi-3-schema.d.ts]
file: string; // [!code --]
file?: Blob; // [!code ++]
```

:::

Any [Schema Object](https://spec.openapis.org/oas/latest.html#schema-object) present in your schema will be run through this formatter (even remote ones!). Also be sure to check the `metadata` parameter for additional context that may be helpful.

There are many other uses for this besides checking `format`. Because it can return TypeScript type text, you can produce any type you'd like (even your own custom types).

### transformProperty

Use the `transformProperty()` option to modify individual property signatures within Schema Objects. This is particularly useful for adding JSDoc comments, validation annotations, or modifying property-level attributes that can't be achieved with `transform` or `postTransform`.

- `transformProperty()` runs **after** type conversion but **before** JSDoc comments are added
- It receives the property (with `irCallbacks: true`, an IR property: `name`, `type`, `isOptional`, `isReadonly`, `comments`), the original schema object, and transformation options
- It returns a changed property, or `undefined` to leave the property unchanged

#### Example: JSDoc validation annotations

A common use case is adding validation annotations based on OpenAPI schema constraints:

::: code-group

```yaml [my-openapi-3-schema.yaml]
components:
  schemas:
    User:
      type: object
      properties:
        name:
          type: string
          minLength: 1
          pattern: "^[a-zA-Z0-9]+$"
        email:
          type: string
          format: email
        age:
          type: integer
          minimum: 0
          maximum: 120
      required: [name, email]
```

:::

::: code-group

```ts [src/my-project.ts]
import fs from "node:fs";
import openapiTS, { astToString } from "openapi-typesafe";

const ast = await openapiTS(mySchema, {
  irCallbacks: true,
  transformProperty(property, schemaObject) {
    // Add validation JSDoc tags based on schema constraints
    const constraints = schemaObject as Record<string, unknown>;
    const validationTags = ["minLength", "maxLength", "minimum", "maximum", "pattern", "format"]
      .filter((key) => constraints[key] !== undefined)
      .map((key) => `@${key} ${constraints[key]}`);
    if (validationTags.length === 0) {
      return undefined;
    }

    // A JSDoc block: the comment text goes between `/*` and `*/`
    const text = `*\n * ${validationTags.join("\n * ")}\n `;
    return { ...property, comments: [...property.comments, { kind: "block", text }] };
  },
});

const contents = astToString(ast);
fs.writeFileSync("./my-schema.ts", contents);
```

:::

This transforms the schema into TypeScript with validation annotations:

::: code-group

```ts [my-schema.d.ts]
export interface components {
  schemas: {
    User: {
      /**
       * @minLength 1
       * @pattern ^[a-zA-Z0-9]+$
       */
      name: string;
      /**
       * @format email
       */
      /** Format: email */
      email: string;
      /**
       * @minimum 0
       * @maximum 120
       */
      age?: number;
    };
  };
}
```

:::

The `transformProperty` function provides access to:
- `property`: The generated IR property (without `irCallbacks`, a TypeScript `PropertySignature` node; deprecated)
- `schemaObject`: The original OpenAPI Schema Object for this property
- `options`: Transformation context including path information and other utilities
