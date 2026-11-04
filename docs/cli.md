---
title: openapi-typesafe CLI
description: The quickest, easiest way to generate types.
---

# CLI

The CLI is the most common way to use openapi-typesafe. The CLI can parse JSON and YAML, and even validates your schemas using the [Redocly CLI](https://redocly.com/docs/cli/commands/lint/). It can parse local and remote schemas (and even supports basic auth).

## Transforming an OpenAPI schema to TypeScript

### Single schema

The simplest way to transform schemas is by specifying an input schema (JSON or YAML), followed by `--output` (`-o`) where you’d like the output to be saved:

```bash
npx openapi-typesafe schema.yaml -o schema.ts

# ✨ openapi-typesafe 1.0.0
# 🚀 schema.yaml → schema.ts [50ms]
```

```bash
npx openapi-typesafe https://petstore3.swagger.io/api/v3/openapi.yaml -o petstore.d.ts

# ✨ openapi-typesafe 1.0.0
# 🚀 https://petstore3.swagger.io/api/v3/openapi.yaml → petstore.d.ts [250ms]
```

Paths may contain spaces and non-ASCII characters, and missing output directories are created. Relative `$ref`s resolve from the path the document was read from: for a symlink, next to the link, not its target (as in openapi-typescript). In `redocly.yaml`, `root` and `output` are relative to that file.

### Multiple schemas

To transform multiple schemas, create a `redocly.yaml` file in the root of your project with [APIs defined](https://redocly.com/docs/cli/configuration/). Under `apis`, give each schema a unique name and optionally a version (the name doesn’t matter, so long as it’s unique). Set the `root` value to your schema’s entry point—this will act as the main input. For the output, set it with `x-openapi-ts.output`:

::: code-group

```yaml [redocly.yaml]
apis:
  core@v2:
    root: ./openapi/openapi.yaml
    x-openapi-ts:
      output: ./openapi/openapi.ts
  external@v1:
    root: ./openapi/external.yaml
    x-openapi-ts:
      output: ./openapi/external.ts
      additional-properties: true # CLI flags are also supported, either in kebab-case or camelCase format
```

:::

::: tip

This will preserve schemas 1:1 input:output. To bundle multiple schemas into one, use Redocly’s [bundle command](https://redocly.com/docs/resources/multi-file-definitions/#bundle)

:::

Whenever you have a `redocly.yaml` file in your project with `apis`, you can omit the input/output parameters in the CLI:

```bash
npx openapi-typesafe
```

::: warning

In previous versions globbing was supported, but that has been **deprecated** in v7 in favor of `redocly.yaml`. You’ll be able to control per-schema output locations better, as well as getting unique per-schema settings.

:::

## Redocly config

A `redocly.yaml` file isn’t required to use openapi-typesafe. By default it extends the `"minimal"` built-in config. But it is recommended if you want to have custom validation rules (or build types for [multiple schemas](#multiple-schemas)). The CLI will try to automatically find a `redocly.yaml` in the root of your project, but you can also provide its location with the `--redocly` flag:

```bash
npx openapi-typesafe --redocly ./path/to/redocly.yaml
```

You can read more about the Redoc’s configuration options [in their docs](https://redocly.com/docs/cli/configuration/).

## Auth

Authentication for non-public schemas is handled in your [Redocly config](https://redocly.com/docs/cli/configuration/#resolve-non-public-or-non-remote-urls). You can add headers and basic authentication like so:

::: code-group

```yaml [redocly.yaml]
resolve:
  http:
    headers:
      - matches: https://api.example.com/v2/**
        name: X-API-KEY
        envVariable: SECRET_KEY
      - matches: https://example.com/*/test.yaml
        name: Authorization
        envVariable: SECRET_AUTH
```

:::

Refer to the [Redocly docs](https://redocly.com/docs/cli/configuration/#resolve-non-public-or-non-remote-urls) for additional options.

## Flags

The following flags are supported in the CLI:

| Flag                               | Alias | Default  | Description                                                                                                         |
|:-----------------------------------| :---- | :------: |:--------------------------------------------------------------------------------------------------------------------|
| `--help`                           |       |          | Display inline help message and exit                                                                                |
| `--version`                        |       |          | Display this library’s version and exit                                                                             |
| `--output [location]`              | `-o`  | (stdout) | Where should the output file be saved?                                                                              |
| `--redocly [location]`             | `-c`  |          | Path to a `redocly.yaml` file (see [Multiple schemas](#multiple-schemas))                                           |
| `--additional-properties`          |       | `false`  | Allow arbitrary properties for all schema objects without `additionalProperties: false`                             |
| `--alphabetize`                    |       | `false`  | Sort types alphabetically                                                                                           |
| `--array-length`                   |       | `false`  | Generate tuples using array `minItems` / `maxItems`                                                                 |
| `--binary-as-blob`                 |       | `false`  | Type raw binary strings (`format: binary`, or a `contentMediaType` that is not text) as `Blob`. See [binaryAsBlob](#binaryasblob) |
| `--fix [names]`                    |       |          | Turn on opt-in fixes of the output, comma-separated, or `all`. See [fix](#fix) |
| `--default-non-nullable`           |       |  `true`  | A property with a `default` is required, except in parameters and inline request bodies; see [defaultNonNullable](#defaultnonnullable) |
| `--properties-required-by-default` |       | `false`  | Treat schema objects without `required` as having all properties required.                                          |
| `--empty-objects-unknown`          |       | `false`  | Allow arbitrary properties for schema objects with no specified properties, and no specified `additionalProperties` |
| `--enum`                           |       | `false`  | Generate true [TS enums](https://www.typescriptlang.org/docs/handbook/enums.html) rather than string unions.        |
| `--enum-values`                    |       | `false`  | Export enum values as arrays.                                                                                       |
| `--conditional-enums`              |       | `false`  | Only generate true TS enums when the `x-enum-*` metadata is available. Requires `--enum=true` to be enabled.        |
| `--dedupe-enums`                   |       | `false`  | Dedupe enum types when `--enum=true` is set                                                                         |
| `--check`                          |       | `false`  | Check that the generated types are up-to-date.                                                                      |
| `--exclude-deprecated`             |       | `false`  | Exclude deprecated fields from types                                                                                |
| `--export-type`                    | `-t`  | `false`  | Export `type` instead of `interface`                                                                                |
| `--immutable`                      |       | `false`  | Generates immutable types (readonly properties and readonly array)                                                  |
| `--path-params-as-types`           |       | `false`  | Allow dynamic string lookups on the `paths` object                                                                  |
| `--root-types`                     |       | `false`  | Exports types from `components` as root level type aliases                                                          |
| `--root-types-no-schema-prefix`    |       | `false`  | Do not add "Schema" prefix to types at the root level (should only be used with --root-types)                       |
| `--root-types-keep-casing`         |       | `false`  | Do not convert root type names to pascal case                                                                        |
| `--make-paths-enum`                |       | `false`  | Generate ApiPaths enum for all paths                                                                                |
| `--generate-path-params`           |       | `false`  | Generate path parameters for all paths where they are undefined by schema                                           |
| `--read-write-markers`             |       | `false`  | Generate `$Read<T>`/`$Write<T>` markers for readOnly/writeOnly properties                                           |
| `--no-lint`                        |       | `false`  | Skip the Redocly lint. Bundling errors (for example a broken `$ref`) still fail                                     |
| `--local-ref-root [dir]`           |       |          | Load local `$ref` files only from this directory and below it; without a value, the working directory (see [Untrusted documents](/advanced#untrusted-documents)) |
| `--remote-ref-hosts [hosts]`       |       |          | Load remote `$ref` documents only from these comma-separated hosts; an empty value allows none                        |

`--content-never` is accepted for compatibility with openapi-typescript and has no effect.

## Exit codes

The CLI exits with a code that tells what went wrong. On failure it prints one line with the message and the error code, for example `✘  Generated types are not up-to-date! src/api.ts differs from its schema. (OUTPUT_STALE)`.

| Code | Meaning | Error codes |
| :--: | :------ | :---------- |
| `0` | Success; with `--check`, the output is up to date | |
| `1` | `--check`: the output differs from the generated types | `OUTPUT_STALE` |
| `2` | A flag, the Redocly config or the environment is wrong | `CLI_FLAG_REMOVED`, `CLI_GLOB_UNSUPPORTED`, `CLI_CONFIG_NOT_FOUND`, `CLI_CONFIG_OUTPUT_MISSING`, `CLI_CHECK_OUTPUT_MISSING`, `TYPESCRIPT_NOT_FOUND`, `CALLBACK_RESULT_UNREADABLE`, `OPTION_FIX_UNKNOWN` |
| `3` | The OpenAPI document cannot be read, is invalid, or cannot be converted | `SCHEMA_SOURCE_EMPTY`, `SCHEMA_SOURCE_INVALID`, `SCHEMA_LOAD_FAILED`, `SCHEMA_PARSE_FAILED`, `SCHEMA_VERSION_UNSUPPORTED`, `SCHEMA_INVALID`, `SCHEMA_REF_INVALID`, `SCHEMA_REF_FORBIDDEN`, `SCHEMA_OBJECT_INVALID`, `SCHEMA_PROPERTY_INVALID`, `SCHEMA_TOO_DEEP`, `SCHEMA_KEY_UNSUPPORTED`, `ENUM_NAME_EMPTY` |
| `4` | An output file cannot be read (`--check`) or written | `OUTPUT_READ_FAILED`, `OUTPUT_WRITE_FAILED` |
| `70` | An unexpected error, which is a bug: the CLI prints the stack trace. Please report it | |

For `SCHEMA_INVALID`, every lint or bundle error is printed first, then a summary line.

With several APIs in `redocly.yaml`, every API is generated (or checked, with `--check`) even when another one fails. Each failure prints its own line, and the exit code is the one of the first failing API, in the order of the config.

### defaultNonNullable

On by default, as in openapi-typescript 7: a property with a `default` is required, so its type
says the value is always there. Two places are exceptions: parameters, and properties of a schema
written inline under a request body.

| Schema | default | `--default-non-nullable=false` |
| --- | --- | --- |
| a query parameter with `default` | optional | optional |
| a property of an inline request body | optional | optional |
| a property of an inline response | required | optional |
| a property of a component (`$ref`), in requests and responses | required | optional |

The last row is the common surprise (openapi-typescript issues #2012, #1957, #1903): a component
used as a request body makes the client send a field the server would fill in. The rule cannot
tell that a `$ref`'d component is a request body.

`default` is the value the receiver assumes when the field is absent; it does not promise that the
field is sent, in a request or in a response. If your API omits such fields, turn the option off:

```bash
npx openapi-typesafe schema.yaml -o schema.d.ts --default-non-nullable=false
```

(`defaultNonNullable: false` in the Node API, `default-non-nullable: false` under `x-openapi-ts`
in `redocly.yaml`.) Every property with a `default` is then optional, as its schema says without
the default. A required parameter with a `default` (openapi-typescript #2319) is not offered: the
caller may always omit it.

### pathParamsAsTypes

By default, your URLs are preserved exactly as-written in your schema:

::: code-group

```ts [my-openapi-3-schema.d.ts]
export interface paths {
  "/user/{user_id}": {
    get: operations["getUser"];
    // …
  };
}
```

:::

Which means your type lookups also have to match the exact URL:

::: code-group

```ts [src/my-project.ts]
import type { paths } from "./my-openapi-3-schema";

type UserResponses = paths["/user/{user_id}"]["get"]["responses"];
```

:::

But when `--path-params-as-types` is enabled, you can take advantage of dynamic lookups like so:

::: code-group

```ts [src/my-project.ts]
import type { paths } from "./my-openapi-3-schema";

const id = "123";
const url = `/user/${id}` as const;
type UserResponses = paths[typeof url]["get"]["responses"]; // matches `paths["/user/{user_id}"]`
```

:::

Though this is a contrived example, you could use this feature to automatically infer typing based on the URL in a fetch client or in some other useful place in your application.

_Thanks, [@Powell-v2](https://github.com/Powell-v2)!_

### arrayLength

This option is useful for generating tuples if an array type specifies `minItems` or `maxItems`.

For example, given the following schema:

::: code-group

```yaml [my-openapi-3-schema.yaml]
components:
  schemas:
    TupleType:
      type: array
      items:
        type: string
      minItems: 1
      maxItems: 2
```

:::

Enabling `--array-length` would change the typing like so:

::: code-group

```ts [my-openapi-3-schema.d.ts]
export interface components {
  schemas: {
    TupleType: string[]; // [!code --]
    TupleType: [] | [string]; // [!code ++]
  };
}
```

:::

This results in more explicit typechecking of array lengths.

::: warning Inherited tuple lengths
With both `minItems` and `maxItems`, the tuples have 0 to `maxItems - minItems` elements, not
`minItems` to `maxItems`, as in openapi-typescript ([#2048](https://github.com/openapi-ts/openapi-typescript/issues/2048)).
The output is kept so that existing types do not change. Only `minItems` alone
(`[string, string, ...string[]]`) and equal bounds (`[string, string]`) give the expected tuples.
Add [`--fix array-length-tuples`](#array-length-tuples) for the right ones.
:::

_Note: this has a reasonable limit, so for example `maxItems: 100` would simply flatten back down to `string[];`_

_Thanks, [@kgtkr](https://github.com/kgtkr)!_

### binaryAsBlob

By default a binary string is typed `string`, as in openapi-typescript. With `--binary-as-blob`, a
string that holds raw bytes is typed `Blob`, so a file upload takes a `Blob` or `File` and a
download is typed like `response.blob()`. These count as raw bytes, as in the OpenAPI
specification's [Working with Binary Data](https://spec.openapis.org/oas/v3.1.1.html#working-with-binary-data):

- OpenAPI 3.0: `type: string` with `format: binary`;
- OpenAPI 3.1: a `contentMediaType` without `contentEncoding`, with or without `type: string`.

These stay `string`: `format: byte`, any `contentEncoding` (such as `base64`), and media types
whose contents are text: `text/*`, JSON, XML and YAML (also as a suffix, such as
`application/problem+json` or `image/svg+xml`), and a few others such as `application/x-ndjson`.

::: code-group

```yaml [my-openapi-3-schema.yaml]
paths:
  /avatars:
    post:
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              required: [file]
              properties:
                file:
                  type: string
                  format: binary
                description:
                  type: string
```

:::

```ts
file: string; // [!code --]
file: Blob; // [!code ++]
```

`Blob` is a global type. It comes with the `"dom"` lib and with `@types/node`, and Deno and Bun
have it too. A project with neither (for example `lib: ["es2022"]` and no Node.js types) gets
`Cannot find name 'Blob'`; add `"dom"` to `lib` or install `@types/node`.

With [openapi-typesafe-fetch](/fetch/), send the object with the `multipart/form-data` header: the
client builds the `FormData` and lets the platform set the boundary. Read a binary response with
`parseAs: "blob"`.

```ts
const { data, error } = await client.POST("/avatars", {
  headers: { "Content-Type": "multipart/form-data" },
  body: { file: new File([bytes], "avatar.png", { type: "image/png" }), description: "Me" },
});

const { data: image } = await client.GET("/avatars/{id}", {
  params: { path: { id: 1 } },
  parseAs: "blob", // data: Blob
});
```

_Thanks, [@joaodibba](https://github.com/joaodibba), for the design in [openapi-typescript#2878](https://github.com/openapi-ts/openapi-typescript/pull/2878)!_

### fix

Some fixes change the output of valid schemas, so a project that upgrades from openapi-typescript
would get other types. They are off by default in 1.x and you turn them on by name
([ADR-021](https://github.com/openapi-typesafe/openapi-typesafe/blob/main/adr/021-opt-in-output-fixes.md)):

::: code-group

```bash [CLI]
npx openapi-typesafe schema.yaml -o schema.ts --fix allof-required
```

```yaml [redocly.yaml]
apis:
  core@v2:
    root: ./openapi/openapi.yaml
    x-openapi-ts:
      output: ./openapi/openapi.ts
      fix: [allof-required]
```

```ts [Node.js]
const ast = await openapiTS(schema, { fix: ["allof-required"] });
```

:::

- Names are comma-separated (`--fix a,b`) and `--fix` may be repeated.
- `all` turns on every fix of the installed version. A minor update that adds a fix then changes
  your output; list the names to keep it stable.
- An unknown name fails with `OPTION_FIX_UNKNOWN` (exit code 2), so a typo does not give the old
  output silently.
- A `fix` setting of an API in `redocly.yaml` replaces `--fix` for that API.
- In 2.0 every fix becomes the default.

| Name | What changes | Upstream | Since |
| :--- | :----------- | :------- | :---- |
| `allof-required` | An `allOf` member with only `required` makes those properties required instead of adding `Record<string, never>` | [#1474](https://github.com/openapi-ts/openapi-typescript/issues/1474), [#1520](https://github.com/openapi-ts/openapi-typescript/issues/1520), [#2165](https://github.com/openapi-ts/openapi-typescript/issues/2165) | 1.0 |
| `anyof-properties` | `anyOf` next to `properties` or `allOf` is intersected with them instead of being one more union member | [#2380](https://github.com/openapi-ts/openapi-typescript/issues/2380) | 1.0 |
| `array-length-tuples` | `--array-length` tuples have `minItems` to `maxItems` items, nested arrays are not wrapped twice, and `--immutable` makes them `readonly`; needs `--array-length` | [#2048](https://github.com/openapi-ts/openapi-typescript/issues/2048), [#2330](https://github.com/openapi-ts/openapi-typescript/pull/2330), [#2546](https://github.com/openapi-ts/openapi-typescript/pull/2546) | 1.0 |

#### allof-required

A common way to reuse an object and make some of its properties required:

::: code-group

```yaml [my-openapi-3-schema.yaml]
components:
  schemas:
    Info:
      type: object
      properties:
        name: { type: string }
        note: { type: string }
    NamedInfo:
      allOf:
        - $ref: "#/components/schemas/Info"
        - type: object
          required: [name]
```

:::

```ts
NamedInfo: components["schemas"]["Info"] & Record<string, never>; // [!code --]
NamedInfo: WithRequired<components["schemas"]["Info"], "name">; // [!code ++]
```

`Record<string, never>` allows no keys, so no value fits the first type. With the fix, a member
that has only `required`, `type: object` and annotations (`title`, `description`, `$comment`,
`deprecated`, `example`, `examples`, `x-` extensions), inline or behind a `$ref`, is left out and
its keys become required in the other members, as a `required` next to `allOf` already does. An
empty `type: object` member, or one with only annotations, is left out too, so no `& unknown`
remains.

The fix leaves these as they are:

- a member with any other keyword, such as `properties`, `nullable`, `default`, `readOnly` or
  `minProperties`, or a `$ref` with sibling keywords;
- an `allOf` whose members are all required-only (there is no other member to carry the keys);
- a key that no other member defines in its `properties` (it is dropped, as for a `required` next
  to `allOf`);
- `properties` next to the `allOf`.

#### anyof-properties

Properties shared by every variant, next to the variants:

::: code-group

```yaml [my-openapi-3-schema.yaml]
components:
  schemas:
    Contact:
      type: object
      properties:
        name: { type: string }
      anyOf:
        - $ref: "#/components/schemas/Email"
        - $ref: "#/components/schemas/Phone"
```

:::

```ts
Contact: { name?: string } | components["schemas"]["Email"] | components["schemas"]["Phone"]; // [!code --]
Contact: { name?: string } & (components["schemas"]["Email"] | components["schemas"]["Phone"]); // [!code ++]
```

A value must match the sibling keywords and at least one `anyOf` variant. The union accepts
`{ name: "Ann" }`, which matches no variant, and when a variant is `unknown` (one with only
`required`, for example) the whole union is `unknown`. With the fix, the type that the sibling keywords give
(`properties`, `additionalProperties`, `allOf`, or a `type` such as `string`) is intersected with
the `anyOf` union, as `oneOf` already is: `type: string` with `anyOf` of enums becomes
`string & ("a" | "b")` instead of `string | "a" | "b"`, which is just `string`.

- An `anyOf` with no sibling type stays a plain union.
- With a `type` list such as `[object, "null"]`, each listed type is intersected with the
  `anyOf` union and `null` is kept: `({ name?: string } & (Email | Phone)) | null`.

#### array-length-tuples

[`--array-length`](#arraylength) turns `minItems` and `maxItems` into tuples. Three cases come out
wrong without the fix:

::: code-group

```yaml [my-openapi-3-schema.yaml]
components:
  schemas:
    Tags:
      type: array
      items: { type: string }
      minItems: 1
      maxItems: 2
    Rows:
      type: array
      minItems: 1
      maxItems: 1
      items:
        type: array
        items: { type: string }
```

:::

```ts
Tags: [] | [string]; // [!code --]
Tags: [string] | [string, string]; // [!code ++]
Rows: [string[][]]; // [!code --]
Rows: [string[]]; // [!code ++]
```

- With both bounds, the tuples have `minItems` to `maxItems` items, not 0 to `maxItems - minItems`.
- An array item is one array level: a nested array, with or without its own bounds, is not
  wrapped in another array.
- With `--immutable` every length tuple is `readonly`, like other arrays.
- A `prefixItems` tuple stays as it is; `minItems` does not wrap it in length tuples.

The fix needs `--array-length` and changes nothing without it; naming it without that flag prints a
notice (`--fix all` does not). Arrays with too many possible tuples stay `T[]`, as before.

### makePathsEnum

This option is useful for generating an enum for all paths in the schema. This can be useful to use the paths from the schema in your code.

Enabling `--make-paths-enum` will add an `ApiPaths` enum like this to the generated types, with one member per operation. A member is named after the `operationId`:

::: code-group

```ts [my-openapi-3-schema.d.ts]
export enum ApiPaths {
  getUserById = "/user/{user_id}",
  listUsers = "/user",
  listUserPets = "/user/{user_id}/pets",
  getUserPet = "/user/{user_id}/pets/{pet_id}",
}
```

:::

Without an `operationId`, the name is built from the method and the URL (`GetUser` for `GET /user`). When two such names would be the same, they name the path parameters too (`GetUserByUserId` for `GET /user/{user_id}`); a name that still repeats gets a number (`listItems2`).

### generatePathParams

This option is useful for generating path params optimistically when the schema has flaky path parameter definitions.
Checks the path for opening and closing brackets and extracts them as path parameters.
Does not override already defined by schema path parameters.

### readWriteMarkers

This option enables proper handling of OpenAPI's `readOnly` and `writeOnly` property modifiers. When enabled, properties are wrapped with marker types that allow [openapi-typesafe-fetch](/fetch/) to enforce visibility rules at compile time.

For example, given the following schema:

::: code-group

```yaml [my-openapi-3-schema.yaml]
components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: integer
          readOnly: true
        name:
          type: string
        password:
          type: string
          writeOnly: true
```

:::

Enabling `--read-write-markers` would generate:

::: code-group

```ts [my-openapi-3-schema.d.ts]
// Helper types generated inline when readWriteMarkers is enabled
type $Read<T> = { readonly $read: T };
type $Write<T> = { readonly $write: T };
type Readable<T> = /* ... strips $Write properties, unwraps $Read */;
type Writable<T> = /* ... strips $Read properties, unwraps $Write */;

export interface components {
  schemas: {
    User: {
      id?: $Read<number>;
      name?: string;
      password?: $Write<string>;
    };
  };
}
```

:::

When used with [openapi-typesafe-fetch](/fetch/), the `Readable<T>` and `Writable<T>` helper types automatically:

- **Exclude `readOnly` properties from request bodies** - You can't accidentally send `id` in a POST/PUT request
- **Exclude `writeOnly` properties from responses** - You can't access `password` on response data

::: code-group

```ts [src/my-project.ts]
import createClient from "openapi-typesafe-fetch";
import type { paths } from "./my-openapi-3-schema";

const client = createClient<paths>({ baseUrl: "https://api.example.com" });

// OK: TypeScript error: 'id' is readOnly and not allowed in request body
await client.POST("/users", {
  body: { id: 123, name: "Alice", password: "secret" },
});

// OK: TypeScript error: 'password' is writeOnly and not available in response
const { data } = await client.GET("/users/{id}", { params: { path: { id: 1 } } });
console.log(data?.password); // Error!
```

:::
