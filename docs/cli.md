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

Paths may contain spaces, non-ASCII characters and `#`, `?` or `%` (a path is never read as a URL; `https:` and `file:` URLs work, and a relative `file:` URL such as `file:api.yaml` resolves as the path `api.yaml` would). A location is a URL when it starts with `http:`, `https:` or `file:`, or with another scheme and `//` (`s3://bucket/api.yaml`, which then fails as no file it can read or write); other text before a colon is part of the file name (`-o out:v2.ts`, `spec:v2.yaml`), and missing output directories are created, and removed again when the output cannot be written (a file or directory name too long for the file system). The output must be a file: a URL of another scheme (`-o https://…`), a path that ends with a separator (`-o gen/`) or with `.` or `..` (`-o gen/.`), or an existing directory fails with `CLI_OUTPUT_INVALID` before anything is generated (openapi-typescript failed with `EISDIR` or a stack trace, or wrote a file named like the directory). Relative `$ref`s resolve from the path the document was read from: for a symlink, next to the link, not its target (as in openapi-typescript). A document read from stdin resolves them from the current directory (openapi-typescript 7.13 used its parent). In `redocly.yaml`, `root` and `output` are relative to that file. An output that is a file the run reads fails with `CLI_OUTPUT_IS_INPUT` and nothing is written to it. These files are the schema, every local file that one of its `$ref`s loads, and the `redocly.yaml` the CLI read; the same file also counts through a symlink or a hard link, or in another letter case on a file system that ignores case (the CLI asks the file system rather than assuming it from the OS). The schema and `redocly.yaml` are checked before anything is generated, the `$ref`'d files once the documents are read. Other files the Redocly config reads (a lint ignore file, configs that `extends` names, plugins) are not checked. With several APIs, every API is read before any output is written, and no output may be the `root` of any API or a file that any API's `$ref`s load. APIs whose outputs are the same file (by the same rules, also before the files exist: `gen/Types.ts` and `gen/types.ts` on such a file system, or a path through a symlinked directory, also one whose target does not exist yet) all fail with `CLI_OUTPUT_DUPLICATE` while the other APIs are generated. Names cannot tell every case (Unicode normalization, `ß` and `SS`, a new directory with no letters to probe), so before the first output is written the CLI creates every missing output, empty, and the file system tells whether two are one file; a run that fails this way removes the files and directories it created. openapi-typescript overwrote the schema, or one API's types with another's, without a word.

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

Under `x-openapi-ts`, an API can set `output`, every generator flag of the [flags table](#flags) (the boolean flags except `--check`, `--help` and `--version`; `lint: false` is `--no-lint`), [`fix`](#fix) (a list or a comma-separated string), `local-ref-root` and `remote-ref-hosts` (a list or a comma-separated string), in kebab-case or camelCase. A setting of an API replaces the CLI flag of the same name for that API. `local-ref-root` is relative to `redocly.yaml`; an empty value means the directory of `redocly.yaml`. Any other key is ignored with the warning `CONFIG_SETTING_UNKNOWN`, so a misspelled setting does not change the output without a hint. A setting of the wrong type (`root-types: "true"`, an `output` that is no text, an `x-openapi-ts` that is no map) and an API without a `root` fail that API with `CLI_CONFIG_INVALID`, which names the API and the key; an unknown name in an API's `fix` fails it with `OPTION_FIX_UNKNOWN`, which names the API. An error while an API is loaded, generated, written or checked (an output error such as `OUTPUT_STALE` or `CLI_OUTPUT_DUPLICATE` too) starts with `API <name>:` too, and keeps its code and exit code; so does every warning, problem and debug line of its generation. A notice about flags follows the CLI flags together with the API's settings and names the API (`API a: --root-types-keep-casing has no effect without --root-types flag`). An invalid `--local-ref-root` fails the run once, before any API. The other APIs are still generated. `content-never` is accepted and has no effect, as on the command line.

::: tip

This will preserve schemas 1:1 input:output. To bundle multiple schemas into one, use Redocly’s [bundle command](https://redocly.com/docs/resources/multi-file-definitions/#bundle)

:::

Whenever you have a `redocly.yaml` file in your project with `apis`, you can omit the input/output parameters in the CLI:

```bash
npx openapi-typesafe
```

::: warning

Globs are not supported (openapi-typescript 7 removed them): a schema path with a `*` fails with `CLI_GLOB_UNSUPPORTED`. The CLI takes one schema argument, so a glob that the shell expands into several paths (an unquoted `g/*.yaml`) fails with `CLI_INPUT_EXTRA`; openapi-typescript generated the first one and passed. A URL (`…/openapi?fields=*`) and an existing file whose name has a `*` are read as they are. List the schemas under `apis` in `redocly.yaml` instead, which also gives each schema its own output location and settings.

:::

## Redocly config

A `redocly.yaml` file isn’t required to use openapi-typesafe. By default it extends the `"minimal"` built-in config. But it is recommended if you want to have custom validation rules (or build types for [multiple schemas](#multiple-schemas)). The CLI will try to automatically find a `redocly.yaml` in the root of your project, but you can also provide its location with the `--redocly` flag:

```bash
npx openapi-typesafe --redocly ./path/to/redocly.yaml
```

You can read more about the Redocly configuration options [in their docs](https://redocly.com/docs/cli/configuration/).

Problems listed in a `.redocly.lint-ignore.yaml` next to `redocly.yaml` (as `redocly lint --generate-ignore-file` writes it) are skipped, as `redocly lint` skips them; with `DEBUG=openapi-ts:*` each one is printed. Without a `redocly.yaml`, the file is read from the current directory.

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

The headers often carry credentials, so openapi-typesafe sends them more carefully than Redocly
does:

- A pattern is matched against the protocol, host and path of the parsed URL. The query, the
  fragment and user info are not part of it, so a `*` cannot match across a `?` into another
  host's URL.
- A header goes over HTTPS, or over plain HTTP to this machine (`localhost`, `127.0.0.0/8`, `[::1]`),
  such as a local dev server. To send it over plain HTTP to another machine, start its pattern
  with `http://`, for example `matches: http://api.internal:8080/**`.
- The loader follows redirects itself (at most 20) and chooses the headers again for each URL. A
  redirect to a URL that no pattern matches gets none of them. Fetch alone keeps every header but
  `Authorization`, `Cookie` and `Proxy-Authorization` on a redirect to another origin.

## Flags

The following flags are supported in the CLI:

| Flag                               | Alias | Default  | Description                                                                                                         |
|:-----------------------------------| :---- | :------: |:--------------------------------------------------------------------------------------------------------------------|
| `--help`                           |       |          | Display inline help message and exit                                                                                |
| `--version`                        |       |          | Display this library’s version and exit                                                                             |
| `--output [location]`              | `-o`  | (stdout) | Where should the output file be saved?                                                                              |
| `--redocly [location]`             | `-c`  | `redocly.yaml` | Path to a `redocly.yaml` file (see [Multiple schemas](#multiple-schemas))                                           |
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
| `--no-lint`                        |       | (lint on) | Skip the Redocly lint. Bundling errors (for example a broken `$ref`) still fail                                     |
| `--local-ref-root [dir]`           |       |          | Load local `$ref` files only from this directory and below it; without a value, the working directory (see [Untrusted documents](/advanced#untrusted-documents)) |
| `--remote-ref-hosts [hosts]`       |       |          | Load remote `$ref` documents only from these comma-separated hosts; an empty value allows none                        |

`--content-never` is accepted for compatibility with openapi-typescript and has no effect.

A flag that takes one value (`--output`, `--redocly`, `--local-ref-root`) or a boolean flag may be
given more than once: the last one wins. `--fix` and `--remote-ref-hosts` add up instead. A flag
may also be written as `--flag=value`; a boolean flag takes `=true` or `=false` there
(`--enum=false`), and any other value fails with `CLI_FLAG_INVALID`. A flag that takes a value has
no `--no-` form: `--no-output`, `--no-fix` and the like fail with `CLI_FLAG_INVALID` (openapi-typescript
used the text `false` as the value, so `--no-output` wrote a file named `false`). A removed flag fails with
`CLI_FLAG_REMOVED` in either form (`--redoc=redocly.yaml`). An unknown flag gets a notice and takes no
value, unless it is written as `--flag=value`: `--alphabetise api.yaml` reads `api.yaml` as the schema
(openapi-typescript took the path as the value of the unknown flag and read stdin). The schema argument
is read as written, also when it looks like a number (`1.10`, `0x10`).

## Warnings

A warning does not stop the run: the types are written and the exit code stays `0`. Warnings, errors and [debug lines](./advanced.md#debugging) go to stderr, also when the types go to stdout (without `--output`), so they never mix with the types; openapi-typescript printed no warnings when it wrote to stdout, and its debug lines went to stdout. When the reader of stdout closes it early (`| head`), the rest of the types is dropped and the exit code stays `0`; openapi-typescript crashed with `EPIPE` and exit code `1`. Every warning (a line that starts with `⚠`) ends with its code, as an error does. A warning from a Redocly lint rule also names the rule, so `redocly.yaml` can change its severity or turn it off; problems listed in a [lint ignore file](#redocly-config) are not printed. A notice about flags, such as `--root-types-keep-casing has no effect without --root-types flag` or `Unknown flag --x is ignored (see --help)`, has no `⚠` and no code.

| Code | Meaning |
| :--- | :------ |
| `CLI_INPUT_IGNORED` | APIs are listed in `redocly.yaml` and an input is given on the command line; the input is ignored and the APIs are generated. See [Multiple schemas](#multiple-schemas) |
| `CLI_OUTPUT_IGNORED` | APIs are listed in `redocly.yaml` and `--output` is given; each API is written to its `x-openapi-ts.output`, and the `--output` path is not used. See [Multiple schemas](#multiple-schemas) |
| `CONFIG_SETTING_UNKNOWN` | An API's `x-openapi-ts` block in `redocly.yaml` has a key that is not an openapi-typesafe setting, for example a misspelled flag; the key is ignored. See [Multiple schemas](#multiple-schemas) |
| `DISCRIMINATOR_MAPPING_INVALID` | A discriminator `mapping` names a schema that is neither an object schema nor an `allOf`, so the generator cannot add the discriminator property to it. That schema keeps its type |
| `DISCRIMINATOR_VALUE_NOT_ALLOWED` | A discriminator gives a schema a value that the schema's own discriminator property does not allow, so no value matches. The Discriminator Object requires the value, from `mapping` or the schema name, to be one the property admits; add a `mapping` entry. See [discriminator values](./advanced.md#discriminator-values) |
| `ENUM_VALUES_EXCLUDED` | `--enum-values`: other keywords exclude some values of an enum (an `allOf` of enums with other values, a discriminator value the enum does not list), so the array is typed by its own values. See [enum values arrays](./advanced.md#enum-values-arrays) |
| `FIX_NEEDS_OPTION` | A [fix](#fix) is named without the option it needs (`array-length-tuples` without `--array-length`, `root-type-numbering` without `--root-types`), so it changes nothing |
| `LINT_PROBLEM` | A Redocly lint rule with severity `warn` found a problem, such as `operation-operationId-unique` ("Every operation must have a unique `operationId`"). The rule is named before the code. Without a `redocly.yaml`, the rules of Redocly's `minimal` config apply, with `operation-operationId-unique` as a warning. Operations with a repeated `operationId` still get distinct keys in `operations`: the first in document order keeps the ID, each later one gets the lowest number from 2 that no other operation has as its ID (`listItems2`, the name `--make-paths-enum` gives it too) |
| `PATH_TEMPLATES_IDENTICAL` | Paths differ only in their parameter names, such as `/users/{id}` and `/users/{name}`. The OpenAPI Paths Object forbids this: "Templated paths with the same hierarchy but different templated names MUST NOT exist as they are identical." See [pathParamsAsTypes](#pathparamsastypes) for the output |
| `QUERYSTRING_NEXT_TO_QUERY` | An `in: querystring` parameter is next to `in: query` parameters, which OpenAPI 3.2 does not allow; the parameter is left out of the types. See [OpenAPI 3.2 support](./introduction.md#openapi-3-2-support) |
| `REF_CIRCULAR` | A `$ref` that the generator follows in the bundled document (a discriminator `mapping` value, a `ctx.resolve` call in a callback, the deprecated `resolveRef` export) leads back to itself; it is left unresolved |
| `REF_NOT_FOUND` | A `$ref` that the generator follows in the bundled document points to nothing there; it is left unresolved |

The Node API exports the codes as `WARNING_CODES` and their union as `WarningCode`, as it exports `ERROR_CODES` and `ErrorCode`. A minor release may add a code; an existing code keeps its meaning (see [Versioning](./compatibility.md#versioning)).

## Exit codes

The CLI exits with a code that tells what went wrong. On failure it prints one line with the message and the error code, for example `✘  Generated types are not up-to-date! src/api.ts differs from its schema. (OUTPUT_STALE)`.

| Code | Meaning | Error codes |
| :--: | :------ | :---------- |
| `0` | Success; with `--check`, the output is up to date | |
| `1` | `--check`: the output differs from the generated types | `OUTPUT_STALE` |
| `2` | A flag, the Redocly config or the environment is wrong | `CLI_FLAG_REMOVED`, `CLI_FLAG_INVALID`, `CLI_GLOB_UNSUPPORTED`, `CLI_CONFIG_NOT_FOUND`, `CLI_CONFIG_INVALID`, `CLI_CONFIG_OUTPUT_MISSING`, `CLI_CHECK_OUTPUT_MISSING`, `CLI_INPUT_MISSING`, `CLI_INPUT_EXTRA`, `CLI_OUTPUT_IS_INPUT`, `CLI_OUTPUT_DUPLICATE`, `CLI_OUTPUT_INVALID`, `CLI_LOCATION_INVALID`, `TYPESCRIPT_NOT_FOUND`, `CALLBACK_RESULT_UNREADABLE`, `OPTION_FIX_UNKNOWN`, `OPTION_INVALID` |
| `3` | The OpenAPI document cannot be read, is invalid, or cannot be converted | `SCHEMA_SOURCE_EMPTY`, `SCHEMA_SOURCE_INVALID`, `SCHEMA_LOAD_FAILED`, `SCHEMA_PARSE_FAILED`, `SCHEMA_VERSION_UNSUPPORTED`, `SCHEMA_INVALID`, `SCHEMA_REF_INVALID`, `SCHEMA_REF_FORBIDDEN`, `SCHEMA_OBJECT_INVALID`, `SCHEMA_PROPERTY_INVALID`, `SCHEMA_TOO_DEEP`, `SCHEMA_KEY_UNSUPPORTED`, `ENUM_NAME_EMPTY` |
| `4` | An output file cannot be read (`--check`) or written | `OUTPUT_READ_FAILED`, `OUTPUT_WRITE_FAILED` |
| `70` | An unexpected error, which is a bug: the CLI prints the stack trace. Please report it | |

For `SCHEMA_INVALID`, every lint or bundle error is printed first, then a summary line.

`--check` compares lines, not line ends: an output that Git checked out with CRLF line ends (`core.autocrlf` on Windows) is up to date when its lines match the generated types. openapi-typescript reported it as stale.

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

As in the original, a place counts as a parameter or a request body when its location holds the
word `parameters`, `requestBody` or `requestBodies` anywhere, so a response of
`/system-parameters` and a property named `hyperparameters` follow the request row too. The
[`default-input-locations`](#default-input-locations) fix reads the place from the document's
structure instead.

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

::: info Paths that a template also matches
`${string}` matches `/` too, so `` `/user/${string}` `` also matches `/user/settings` and
`` `/user/${string}/keys` ``. TypeScript then requires those paths' types to fit the template's
type, and the output does not compile when they do not (TS2411, TS2413). The generator checks
each such path against the template the way TypeScript does: through `operations[…]` and
`components[…]`, into unions, intersections, arrays, tuples, index signatures and every property
type. Where the path's type surely does not fit, `paths` is written as an intersection,
`` export type paths = { … } & { [path: `/user/${string}`]: … } ``, with each such template in an
object of its own. Every path keeps its type: `paths["/user/settings"]` and
`` paths[`/user/${string}`] `` are the same as before. Output that compiles stays the same,
`export interface paths` included. Where the check cannot tell, such as for a utility type
(`Record<string, never>`) or the type of a callback, the output stays as the original wrote it,
which may then not compile.

A URL that two templates match, such as `/user/123/keys` for `` `/user/${string}` `` and
`` `/user/${string}/keys` ``, gets both types: `paths["/user/123/keys"]` is their intersection.
TypeScript has no string type that excludes `/`
([microsoft/TypeScript#41160](https://github.com/microsoft/TypeScript/issues/41160)), so look such a
path up by its template, `` paths[`/user/${string}/keys`] ``.
:::

::: info Paths that differ only in parameter names
OpenAPI forbids paths such as `/user/{user_id}` and `/user/{name}`, which match the same URLs; the
generator warns about them (`PATH_TEMPLATES_IDENTICAL`, see [Warnings](#warnings)). With
`--path-params-as-types` both get the same key, `` `/user/${string}` ``, and one object with that
signature twice does not compile (TS2374), so each of them is written in an object of its own in
the intersection. `` paths[`/user/${string}`] `` is then the intersection of both path items;
merge the paths in the document to get one. Without the flag, each path keeps its own key.
:::

::: info Boolean path parameters
`` `${boolean}` `` is the union `"true" | "false"`. A template whose only placeholders are
booleans is a union of literals, and an index signature takes none (TS1337), so the original's
`` [path: `/flags/${boolean}`] `` did not compile. Such a path is written as plain keys instead,
`"/flags/true"` and `"/flags/false"`, with the same path item type; n boolean parameters give 2ⁿ
keys. A key that a path of the document already has is left out: that path is the more specific
one, and a key written twice does not compile. Next to another placeholder the template is a valid
signature for the same URLs, so it stays (`` [path: `/a/${number}/b/${boolean}`] ``).
:::

::: info `$ref`s into a templated path
A `$ref` into a path, such as `#/paths/~1pets~1%7Bid%7D/get/responses/200`, is typed as an index
of `paths`. When the template has a `${number}` or `${boolean}` placeholder, the URL `/pets/{id}`
does not match it, so the index is the template: `` paths[`/pets/${number}`]["get"] ``. The
original wrote `paths["/pets/{id}"]`, which does not compile (TS2339). The type of an
`--enum-values` array in such a path is indexed the same way
(`` FlattenedDeepRequired<paths>[`/pets/${number}`] ``). With only `${string}` placeholders the URL
matches the template, and the index stays the URL.
:::

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

_Note: when the tuples would have 30 or more elements in all, the type stays `string[]` (for example with `maxItems: 100`)._

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
`Cannot find name 'Blob'`; add `"dom"` to `lib` or install `@types/node`. With
`--root-types --root-types-no-schema-prefix`, the alias of a schema named `Blob` is `Blob_2`, so
it does not hide the global type.

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
| `allof-discriminated-union` | An `allOf` `$ref` to a discriminated union is the union, not `Omit` of it with the schema's own name as the discriminator value | [#1464](https://github.com/openapi-ts/openapi-typescript/issues/1464), [#1690](https://github.com/openapi-ts/openapi-typescript/issues/1690) | 1.0 |
| `allof-required` | An `allOf` member with only `required` makes those properties required instead of adding `Record<string, never>` | [#1474](https://github.com/openapi-ts/openapi-typescript/issues/1474), [#1520](https://github.com/openapi-ts/openapi-typescript/issues/1520), [#2165](https://github.com/openapi-ts/openapi-typescript/issues/2165) | 1.0 |
| `anyof-oneof-descriptions` | The JSDoc of a schema lists the descriptions of its `anyOf` and `oneOf` members, which were dropped | [#2142](https://github.com/openapi-ts/openapi-typescript/issues/2142), [#2143](https://github.com/openapi-ts/openapi-typescript/pull/2143) | 1.0 |
| `anyof-oneof-required` | An `anyOf` or `oneOf` whose variants have only `required` keys of the sibling `properties` gives the parent with each variant's keys required, instead of `unknown` | none (found in the compat corpus) | 1.0 |
| `anyof-properties` | `anyOf` next to `properties` or `allOf` is intersected with them instead of being one more union member | [#2380](https://github.com/openapi-ts/openapi-typescript/issues/2380) | 1.0 |
| `array-length-tuples` | `--array-length` tuples have `minItems` to `maxItems` items, nested arrays are not wrapped twice, and `--immutable` makes them `readonly`; needs `--array-length` | [#2048](https://github.com/openapi-ts/openapi-typescript/issues/2048), [#2330](https://github.com/openapi-ts/openapi-typescript/pull/2330), [#2546](https://github.com/openapi-ts/openapi-typescript/pull/2546) | 1.0 |
| `dedupe-enum-names` | With `--enum --dedupe-enums`, a shared enum is named by a rule that does not depend on the document order, instead of after the first schema in the document; needs both flags | [#1683](https://github.com/openapi-ts/openapi-typescript/issues/1683) | 1.0 |
| `default-input-locations` | With `--default-non-nullable` (on by default), parameters and request bodies are found by the document's structure, instead of by the words `parameters`, `requestBody` and `requestBodies` anywhere in a schema's location, so a defaulted property of a response of `/system-parameters` or of a schema property named `hyperparameters` is required like any other | none (found in the rc.5 review) | 1.0 |
| `discriminator-member-required` | `required` next to an `allOf` `$ref` to a discriminator member gives `WithRequired` instead of being dropped | [#2162](https://github.com/openapi-ts/openapi-typescript/issues/2162) | 1.0 |
| `discriminator-values` | The value a discriminator member gets: a schema that a `mapping` names gets the mapped value only (not also its schema name, which made the property `never`); a schema's own `mapping` is kept when it also inherits a discriminator; a member that declares its value gets no second property; with `--enum` the value is a member of the owner's enum (`PetType.Cat`) | [#2200](https://github.com/openapi-ts/openapi-typescript/issues/2200), [#2124](https://github.com/openapi-ts/openapi-typescript/issues/2124), [#1700](https://github.com/openapi-ts/openapi-typescript/issues/1700) | 1.0 |
| `exploded-query-objects` | The properties of an exploded object query parameter (`style: form`, the default) are keys of `query`, as they are sent, instead of one key named after the parameter | [#2361](https://github.com/openapi-ts/openapi-typescript/issues/2361) | 1.0 |
| `nullable-enums` | With `--enum`, an enum that lists `null` becomes a TypeScript enum of its other values and the type adds `\| null`, instead of staying a union; needs `--enum` | [#1872](https://github.com/openapi-ts/openapi-typescript/issues/1872) | 1.0 |
| `parameter-header-content` | A parameter or a header with `content` instead of `schema` (a JSON object in a query parameter) is typed by the schema of its media type, instead of `string` or a map of media types | none (found in the rc.4 review) | 1.0 |
| `path-param-type-names` | With `--path-params-as-types`, a path parameter named `number`, `string` or `boolean` gets its placeholder, instead of the `$` and the `{name}` text the original leaves when it replaces that name inside an earlier placeholder; needs `--path-params-as-types` | none (found in our own tests) | 1.0 |
| `prefix-items` | A `prefixItems` tuple is open and its elements after `minItems` are optional, as in JSON Schema 2020-12, unless `items` or `unevaluatedItems` closes it | [#1892](https://github.com/openapi-ts/openapi-typescript/issues/1892) | 1.0 |
| `read-write-refs` | `readOnly` and `writeOnly` of a schema that a property references with `$ref` or `allOf` make the property `readonly`, and count for `--read-write-markers` | [#1938](https://github.com/openapi-ts/openapi-typescript/issues/1938) | 1.0 |
| `ref-pointers` | A schema `$ref` into another schema's keywords (`content/<type>/schema`, `items`, `allOf/0`) gets the type it points at also where the original type compiles through an index signature (`--additional-properties`, `additionalProperties: true`), where it is `unknown`; where the original does not compile, this is the default | none (found in the compat corpus) | 1.0 |
| `ref-siblings` | OpenAPI 3.1 and 3.2: keywords next to a `$ref` (`required`, `properties`, `enum`) apply, as JSON Schema 2020-12 says, instead of being dropped; OpenAPI 3.0 ignores them, as its spec says | none (found in the rc.4 review) | 1.0 |
| `root-type-numbering` | With `--root-types --root-types-no-schema-prefix`, schemas of one root name (`PetStore`, `pet_store`) each get an alias: the later keeps the name, the earlier get `PetStore_2`, … instead of none; needs both flags | none (found in our own tests) | 1.0 |
| `unevaluated-properties` | `unevaluatedProperties` types the keys that no other keyword declares, with an index signature, instead of being ignored | [#2839](https://github.com/openapi-ts/openapi-typescript/issues/2839), [#2880](https://github.com/openapi-ts/openapi-typescript/pull/2880) | 1.0 |

#### allof-discriminated-union

A schema that reuses a discriminated union through `allOf`:

::: code-group

```yaml [my-openapi-3-schema.yaml]
components:
  schemas:
    Pet:
      oneOf:
        - $ref: "#/components/schemas/Cat"
        - $ref: "#/components/schemas/Dog"
      discriminator:
        propertyName: kind
    Response:
      allOf:
        - $ref: "#/components/schemas/Pet"
```

:::

```ts
Response: { kind: "Response" } & Omit<components["schemas"]["Pet"], "kind">; // [!code --]
Response: components["schemas"]["Pet"]; // [!code ++]
```

Without the fix, `Response` is treated as one more member of `Pet`: its own name becomes the
`kind` value, which no `Cat` or `Dog` has, and `Omit` on a union keeps only the keys that every
member has. With the fix, a `$ref` to a union in `allOf` is the union, and a schema that only
reuses a union gets no discriminator value. A schema that the union lists (`Cat`) keeps its value,
and so does a schema that the union's `mapping` names: the mapping makes it a member, so its output
stays as without the fix.

- An `allOf` `$ref` to a discriminated union that lists the schema itself is typed with the
  union's own keywords by default, fix or not, because that output referred to itself and did not
  compile (TS2502, [#1665](https://github.com/openapi-ts/openapi-typescript/issues/1665)). A
  union that inherits its discriminator through `allOf` then gets no value of its own: each
  member sets it.

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

#### anyof-oneof-descriptions

A member of `anyOf` or `oneOf` may have its own `description`. The member is a union member in
TypeScript, and a union member has no JSDoc an editor shows, so without the fix the descriptions
are lost. With it the JSDoc of the property or schema lists them under its own description, by
keyword:

::: code-group

```yaml [my-openapi-3-schema.yaml]
item:
  description: The item.
  oneOf:
    - type: boolean
      description: Description 1
    - type: string
      description: Description 2
```

:::

```ts
/** @description The item. */ // [!code --]
/** // [!code ++]
 * @description The item. // [!code ++]
 *     One of: // [!code ++]
 *     - Description 1 // [!code ++]
 *     - Description 2 // [!code ++]
 */ // [!code ++]
item: boolean | string;
```

- A member's description holds only where that member applies, so each one is a bullet of its
  own, not joined into one sentence.
- A member's own `description` counts, also one next to a `$ref`. A member with only a `$ref` has
  none: the schema it names is documented where it is declared.
- Members without a description are left out. With both keywords, `Any of:` comes before
  `One of:`.
- It applies to properties and to component schemas.

#### anyof-oneof-required

`anyOf: [{ required: [cname] }, { required: [source] }]` next to `properties` says which of the
properties must be there. Each variant has no type of its own, so it is `unknown`, and without
the fix the schema is `{ cname?: string; source?: string } | unknown`, which is `unknown`. With
the fix each variant is the parent with its keys required:

```ts
Pages: { cname?: string; source?: string } | unknown | unknown; // [!code --]
Pages: WithRequired<{ cname?: string; source?: string }, "cname"> | WithRequired<{ cname?: string; source?: string }, "source">; // [!code ++]
```

- It applies to `anyOf` and `oneOf` when every variant has only `required` (and `description` or
  `title`), each key is in the schema's own `properties`, and the schema has a type next to them.
  Otherwise nothing changes; `anyof-properties` then applies as before.
- A key whose property `--exclude-deprecated` leaves out does not count as one of the schema's
  properties.
- Only an object has the keys: with a `type` list (`[object, "null"]`) the `object` member gets
  them, `(WithRequired<…> | WithRequired<…>) | null`; a schema of another type keeps the old
  output.

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

The fix needs `--array-length` and changes nothing without it; naming it without that flag prints the warning `FIX_NEEDS_OPTION` (`--fix all` does not). Arrays with too many possible tuples stay `T[]`, as before.

#### dedupe-enum-names

`--dedupe-enums` declares one enum for schemas with the same members. Without the fix it takes the
name of the first of them in the document, so adding a schema before it renames the enum, and code
that uses it breaks. With the fix the name is chosen from all of them, by this rule:

1. A component schema that is the enum itself (`#/components/schemas/Status`) wins.
2. Then the shortest name.
3. Then the first name in code-unit order (as `Array.prototype.sort` compares strings).

```ts
// Alpha.mode comes first in the document, Pet.state after it, with the same values.
export enum AlphaMode { // [!code --]
export enum PetState { // [!code ++]
```

- No step depends on the document order. A new schema changes the name only when it ranks first,
  for example a new component schema with these values.
- Two enums with other members whose best names are the same (`Pet` and `Pet-` both give
  `PetState`) are resolved in the order of their values: the later one takes its next name.
- The names are built as without the fix (`PetState` for `Pet.state`).
- The schemas are known only at the end, so the document is transformed twice; `transform`,
  `transformProperty` and `postTransform` callbacks run in both passes.
- It needs `--enum` and `--dedupe-enums` and changes nothing without them; naming it without them
  prints the warning `FIX_NEEDS_OPTION` (`--fix all` does not).
- An `x-enum-name` extension is not read: no tool of the ecosystem defines it.

#### default-input-locations

`--default-non-nullable` keeps a defaulted property of a parameter or a request body optional.
Without the fix that place is any location whose text holds `parameters`, `requestBody` or
`requestBodies`, so the name of a path or a schema decides it:

```ts
// GET /system-parameters answers { page }, with page: { default: 1 }.
page?: number; // [!code --]
page: number; // [!code ++]
```

With the fix the place is read from the document's structure: a parameter or a request body of
an operation or a path item, also under `webhooks`, callbacks and `components` (`parameters`,
`requestBodies`, `pathItems`). A response of `/system-parameters` and a property named
`parameters` or `hyperparameters` follow the response row of the table under
[defaultNonNullable](#defaultnonnullable).

- It only makes properties required; none becomes optional. A component schema used as a request
  body is no request-body place either way, so a property under such a component that the word
  kept optional becomes required: the client must send it.
- The exported transformers can be given a `path` that points nowhere in the document; the words
  still decide there.
- It changes nothing with `--default-non-nullable=false`; naming it then prints the warning
  `FIX_NEEDS_OPTION` (`--fix all` does not).

#### discriminator-member-required

`required` next to an `allOf` `$ref`, where the referenced schema is a discriminator member:

::: code-group

```yaml [my-openapi-3-schema.yaml]
components:
  schemas:
    CatProps:
      type: object
      properties:
        kittens: { type: number }
    Cat:
      type: object
      required: [kittens]
      allOf:
        - $ref: "#/components/schemas/CatProps"
    UpdatePet:
      oneOf:
        - $ref: "#/components/schemas/CatProps"
      discriminator:
        propertyName: sound
        mapping:
          meow: "#/components/schemas/CatProps"
```

:::

```ts
Cat: components["schemas"]["CatProps"]; // [!code --]
Cat: WithRequired<components["schemas"]["CatProps"], "kittens">; // [!code ++]
```

Without the fix every key is dropped, because the discriminator property of a member must not be
required twice. With the fix only the keys that the member already requires are left out.

#### discriminator-values

A discriminator gives each schema it names a required enum property. Without the fix every
discriminator adds its own one. A schema that a `mapping` names (`cat` for `Cat`) and that a
discriminated `oneOf` without a mapping also lists gets the schema name too (`Cat`), and the two
properties intersect to `never`: no value of `Cat` can be written. With the fix the values of one
property merge into one enum:

::: code-group

```yaml [my-openapi-3-schema.yaml]
components:
  schemas:
    Pet:
      type: object
      required: [kind]
      properties:
        kind: { type: string }
      discriminator:
        propertyName: kind
        mapping:
          cat: "#/components/schemas/Cat"
    Cat:
      allOf:
        - $ref: "#/components/schemas/Pet"
    Shelter:
      properties:
        resident:
          oneOf:
            - $ref: "#/components/schemas/Cat"
          discriminator:
            propertyName: kind
```

:::

```ts
Cat: Omit<components["schemas"]["Pet"], "kind"> & { kind: "Cat" } & { kind: "cat" }; // [!code --]
Cat: Omit<components["schemas"]["Pet"], "kind"> & { kind: "cat" }; // [!code ++]
```

- A value from a `mapping` wins: the schema name is used only where no mapping, in any
  discriminator of that property, gives the schema a value. That matches the OpenAPI rule that an
  explicit mapping replaces the implicit one.
- Two mappings that give one schema different values make one enum with both (`"cat" | "feline"`).
- Two discriminators with different property names still add two properties, also through a
  schema that owns one of them: when `Content` owns `subtype` and `allOf`s `Element`, which owns
  `contentType`, a `Video` that `allOf`s `Content` gets both, and a schema that `allOf`s `Video`
  omits both from it (`Omit<Video, "subtype" | "contentType">`).
- With `--enum`, the merged enum is declared once.
- With `--enum --dedupe-enums`, a shared enum keeps the name it has without the fix, after the
  first schema that declares it: a member's value that refers to it does not rename it.

The fix also corrects the value in these cases:

##### A schema's own mapping

A schema with its own discriminator that also inherits one:

::: code-group

```yaml [my-openapi-3-schema.yaml]
components:
  schemas:
    Element:
      type: object
      properties:
        contentType: { type: string }
      discriminator:
        propertyName: contentType
    Content:
      type: object
      required: [contentType]
      allOf:
        - $ref: "#/components/schemas/Element"
      discriminator:
        propertyName: contentType
        mapping:
          video: "#/components/schemas/Video"
    Video:
      allOf:
        - $ref: "#/components/schemas/Content"
```

:::

```ts
Video: { contentType: "Video" } & Omit<components["schemas"]["Content"], "contentType">; // [!code --]
Video: Omit<components["schemas"]["Content"], "contentType"> & { contentType: "video" }; // [!code ++]
```

Without the fix the inherited discriminator replaces `Content`'s own, with its `mapping`, so the
mapped values are lost for the schemas that come after `Content` in the document. With the fix a
schema keeps its own discriminator, and the result does not depend on the order of the schemas.
A schema without one still inherits its parent's.

##### A value the member declares

A member that declares its discriminator value itself:

::: code-group

```yaml [my-openapi-3-schema.yaml]
components:
  schemas:
    Image:
      oneOf:
        - $ref: "#/components/schemas/AgentImage"
      discriminator:
        propertyName: type
        mapping:
          agent: "#/components/schemas/AgentImage"
    AgentImage:
      allOf:
        - $ref: "#/components/schemas/ImageBase"
        - type: object
          required: [type]
          properties:
            type: { type: string, enum: [agent] }
```

:::

```ts
AgentImage: components["schemas"]["ImageBase"] & { type: "agent" } & { type: "agent" }; // [!code --]
AgentImage: components["schemas"]["ImageBase"] & { type: "agent" }; // [!code ++]
```

The added property has the same type, so the output is right but noisy. With the fix, a member
that requires the property, in its own keywords or an inline `allOf` item, with an `enum` or
`const` of exactly its discriminator values gets no added property. A member that declares other
values, or does not require the property, still gets it.

##### Enum members with `--enum`

With [`--enum`](#flags), a discriminator owner whose property is an enum:

::: code-group

```yaml [my-openapi-3-schema.yaml]
components:
  schemas:
    PetType:
      type: string
      enum: [Dog, Cat]
    Pet:
      type: object
      required: [petType]
      properties:
        petType: { $ref: "#/components/schemas/PetType" }
      discriminator:
        propertyName: petType
        mapping:
          Cat: "#/components/schemas/Cat"
    Cat:
      allOf:
        - $ref: "#/components/schemas/Pet"
        - type: object
          properties:
            name: { type: string }
```

:::

```ts
Cat: Omit<components["schemas"]["Pet"], "petType"> & { name?: string } & { petType: CatPetType }; // [!code --]
Cat: Omit<components["schemas"]["Pet"], "petType"> & { name?: string } & { petType: PetType.Cat }; // [!code ++]
```

Without the fix each member declares an enum of its own (`export enum CatPetType { Cat = "Cat" }`),
which is not assignable to `PetType`, so a `Cat` is not a `Pet`. With the fix the added value is a
member of the owner's enum and no new enum is declared. A member without a mapping gets its
schema name as the value, as the string `"Cat"`, which `PetType` does not accept either; with the
fix it is `PetType.Cat` too.

- The owner's enum may be a `$ref`, inline, or inherited through `allOf`.
- An owner that declares no such property (a `oneOf` with a `mapping`) gives the value of the
  enum that the member inherits through its `allOf` `$ref`s.
- Members use the names `--enum` gives: `PetType.hot_dog` for `hot-dog`, and
  `typeof PetType["+"]` for a quoted member.
- A value that the owner's enum lacks keeps the old output.
- Without `--enum` there is no enum to take members from, and this part changes nothing.

#### exploded-query-objects

A query parameter with an object schema is sent with `style: form` and `explode: true` unless it
says otherwise, so its properties are the query keys: `?page=1&size=10`, not `?filter=…`. Without
the fix `query` has one key named after the parameter. With it the object's properties are keys of
`query`:

::: code-group

```yaml [my-openapi-3-schema.yaml]
parameters:
  - name: GetPosts
    in: query
    schema:
      $ref: "#/components/schemas/GetPosts"
```

:::

```ts
query?: { // [!code --]
  GetPosts?: components["schemas"]["GetPosts"]; // [!code --]
}; // [!code --]
query?: Partial<components["schemas"]["GetPosts"]>; // [!code ++]
```

- The other query parameters stay keys of their own: `{ sort?: string } & Partial<…>`.
- An object with an index signature (`additionalProperties`) also takes the value types of the
  other query keys there: `{ page?: number } & Partial<{ [key: string]: string | number |
  undefined }>`. TypeScript checks an index signature against every key, so with only `string`
  no value with `page` was assignable. When the object is a `$ref`, its type is written out in
  place for this; without other query keys the `$ref` is kept.
- An optional parameter's properties are all optional (`Partial`): leaving the parameter out sends
  none of them. A required parameter keeps the object as it is, and `query` is required.
- A schema is an object when its `type` is `object` (also with `null`), when it has object keywords
  and no `type`, or when every `allOf`, `anyOf` or `oneOf` member is one; `$ref`s are followed.
- `style: deepObject`, `explode: false`, other styles and other locations keep the name.
- The default `querySerializer` of `openapi-typesafe-fetch` sends top-level primitive values as
  `key=value`, which is this format, so the client needs no other option.

#### nullable-enums

`--enum` makes string and number enums TypeScript enums. An enum member cannot be `null`, so an
enum that lists `null` stays a union without the fix (the original meant to allow it, but tested
`typeof null`). With it the other values become the enum, and `null` is added to the type where the
schema allows it:

::: code-group

```yaml [my-openapi-3-schema.yaml]
Values:
  type: [string, "null"]
  enum: [VALUE1, VALUE2, null]
```

:::

```ts
Values: "VALUE1" | "VALUE2" | null; // [!code --]
Values: Values | null; // [!code ++]
export enum Values { // [!code ++]
  VALUE1 = "VALUE1", // [!code ++]
  VALUE2 = "VALUE2", // [!code ++]
} // [!code ++]
```

- `null` is added only when the type also admits it: `type` absent or listing `"null"`, or
  OpenAPI 3.0 `nullable: true`. A value must pass both keywords, so `type: string` with `null` in
  `enum` gives just the enum.
- `x-enum-varnames` and `x-enum-descriptions` keep their positions: the entry for `null` is
  skipped.
- OpenAPI 3.0 `nullable: true` next to an `enum` that does not list `null` allows no `null`: other
  keywords keep their meaning (OpenAPI 3.0.3), so `--enum` gives just the enum, with or without the
  fix. Without `--enum` the union keeps the original's `| null`; list `null` in the `enum` to allow
  it in both.
- An enum of only `null` stays `null`.
- It needs `--enum` and changes nothing without it; naming it without it prints the warning `FIX_NEEDS_OPTION` (`--fix
  all` does not).

#### path-param-type-names

`--path-params-as-types` replaces each `{name}` of a URL with the placeholder of its parameter's
type, one after the other, as openapi-typescript does. That replaces the first `{name}` in the
text so far, so a parameter named `number`, `string` or `boolean` can hit the placeholder an
earlier parameter got instead of its own:

```yaml
/invoices/{id}/lines/{number}: # both parameters are integers
```

```ts
[path: `/invoices/$${number}/lines/{number}`]: { … }; // [!code --]
[path: `/invoices/${number}/lines/${number}`]: { … }; // [!code ++]
```

Without the fix the key matches `` `/invoices/$1/lines/{number}` `` only. With it every parameter
gets its own placeholder. It needs `--path-params-as-types` and changes nothing without it; naming
it without the flag prints the warning `FIX_NEEDS_OPTION` (`--fix all` does not).

#### prefix-items

In JSON Schema 2020-12, `prefixItems` types the first items only. More items are allowed unless
`items` or `unevaluatedItems` is `false`, and `minItems` sets how many are required (none by
default). Without the fix the tuple is closed and every element required. With it:

```yaml
type: array
prefixItems: [{ type: number }, { type: string }]
```

| Next to `prefixItems` | Without the fix | With the fix |
| :-- | :-- | :-- |
| nothing | `[number, string]` | `[number?, string?, ...unknown[]]` |
| `minItems: 2` | `[number, string]` | `[number, string, ...unknown[]]` |
| `minItems: 1, items: { type: number }` | `[number, string]` | `[number, string?, ...number[]]` |
| `minItems: 2, items: false` | `[number, string]` | `[number, string]` |

- Further items have the `items` type. Without `items`, `unevaluatedItems` types them, with the
  `contains` type added (`contains` evaluates the items it matches); without either they are
  `unknown`.
- `unevaluatedItems` next to `items` changes nothing: `items` evaluates every further item.
- With `--array-length` the fixed tuple gets no length tuples around it; with `--immutable` it is
  `readonly`.

#### read-write-refs

`readOnly` and `writeOnly` are annotations of a schema. A property whose schema is a `$ref` to a
`readOnly` schema is read-only too: in OpenAPI 3.0 the reference is the property's definition, and
in 3.1 the annotations of the referenced schema apply to the value. Without the fix only the flags
written on the property itself count. With it the flags of the `$ref` target and of `allOf`
members count too:

::: code-group

```yaml [my-openapi-3-schema.yaml]
ParticipantType:
  type: string
  readOnly: true
  enum: [MAIN, CO]
Participant:
  type: object
  properties:
    kind:
      $ref: "#/components/schemas/ParticipantType"
```

:::

```ts
kind?: components["schemas"]["ParticipantType"]; // [!code --]
readonly kind?: components["schemas"]["ParticipantType"]; // [!code ++]
```

- A `$ref` to a `$ref` and nested `allOf` members are followed; recursion stops at a schema seen
  before.
- `anyOf` and `oneOf` members are not read: only one of them may apply.
- With `--read-write-markers` the property gets `$Read<T>` or `$Write<T>`, so `Readable` and
  `Writable` drop it where it is not sent; a property both flags reach gets no marker.

#### ref-pointers

A `$ref` can point into another schema:
`#/paths/~1a/get/responses/200/content/application~1json/schema` or
`#/components/schemas/Base/allOf/0/properties/id`. The original indexed every segment by name
(`["content"]["application/json"]["schema"]`), but the generated types have no `schema`, `items`
or `allOf` member. Where that does not compile, 1.0 writes the type the pointer means by default:

```ts
bag?: paths["/a"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]; // [!code --]
bag?: paths["/a"]["get"]["responses"]["200"]["content"]["application/json"]; // [!code ++]
```

- The `schema` of a media type, header or component parameter is left out, `items` is indexed by
  `[number]`, `additionalProperties` by `[string]`, and an optional or nullable value is wrapped in
  `NonNullable` before it is indexed.
- `[string]` is the `additionalProperties` type only where the index signature holds nothing
  else. Next to `properties` it also holds the property types, and next to `patternProperties` the
  pattern types, so such a pointer gets the target's type inline, as does a pointer to a pattern
  (`patternProperties/^x`). With `--exclude-deprecated`, a pointer to a property it leaves out gets
  the property's type inline, not the index signature's.
- A pointer through a keyword with no type of its own (`allOf/0`, `definitions/A`, operation or
  path item `parameters/0`) gets the target's type written inline; a target that points back at
  itself keeps the original type. The inline type is the one the generator writes for that schema,
  so with `--enum` it uses the same enum, not a second one named after the pointer.
- The `content` of a header is left out: the header is a map of its media types
  (`components["headers"]["H"]["text/plain"]`), or with the `parameter-header-content` fix the
  type of its first media type. A pointer into another media type with the fix, into the `content`
  of a parameter typed `string`, or into `content` next to a `schema` gets the target's type
  inline.
- With `--read-write-markers`, a property that is only `readOnly` or only `writeOnly` is
  `$Read<T>` or `$Write<T>`, which has no other member, so a pointer through it gets the target's
  type inline; a pointer to the property itself keeps `$Read<T>`.
- A pointer may pass through another `$ref` (`Wrap/properties/o/properties/v`, where `o` is a
  `$ref`): the rest of the pointer is read from the `$ref`'s target.

A parameter `$ref` to a parameter of another operation or path item
(`#/paths/~1a/get/parameters/0`) is indexed by the parameter's location and name. When every
parameter of that location is optional, the location is an optional member (`query?:`), so it is
wrapped in `NonNullable` first; a `$ref` to an OpenAPI 3.2 `in: querystring` parameter reads the
`query` member that the parameter types:

```ts
q?: paths["/a"]["get"]["parameters"]["query"]["q"]; // [!code --]
q?: NonNullable<paths["/a"]["get"]["parameters"]["query"]>["q"]; // [!code ++]
```

Where the generated type has an index signature (`--additional-properties`, or the schema's own
`additionalProperties`), the original compiles: `["schema"]` reads the index signature and is
`unknown`. Changing it could break code, so it stays without the fix; with `ref-pointers` it gets
the type above too.

#### parameter-header-content

A parameter or a header is described by `schema` or by `content`, a map with one media type whose
schema describes the value, for example a JSON object sent in one query parameter. The original
read only `schema`, so such a parameter was `string`, and a header was a map of its media types:

```ts
filter?: string; // [!code --]
filter?: { status?: string; limit?: number }; // [!code ++]
"X-Rate": { "application/json": { limit: number } }; // [!code --]
"X-Rate": { limit: number }; // [!code ++]
```

- The first media type of `content` is read; a media type without a schema, or a header with an
  empty `content`, gives `unknown`.
- The fix was named `parameter-content` in rc.4; it now covers headers too and that name is gone.
- An `in: querystring` parameter (OpenAPI 3.2) is typed this way without the fix (ADR-020).
- The fix works in OpenAPI 3.0 documents too, where `content` has the same meaning.

#### ref-siblings

In OpenAPI 3.1 and 3.2 a schema is a JSON Schema 2020-12 schema, where `$ref` is one keyword among
the others and all of them apply. The original read only the `$ref`:

```yaml
WithSiblings:
  $ref: "#/components/schemas/Base"
  required: [extra]
  properties: { extra: { type: string } }
```

```ts
WithSiblings: components["schemas"]["Base"]; // [!code --]
WithSiblings: { extra: string } & components["schemas"]["Base"]; // [!code ++]
```

- The schema is typed as `allOf: [{ $ref }]` next to the same keywords, with every rule for
  `allOf`: `required` alone gives `WithRequired<Base, "id">`, an `enum` gives its values. This
  holds wherever the schema is: a component, a property, array `items`, a body or a parameter.
- Keywords that only annotate (`description`, `title`, `examples`, `default`, `deprecated`,
  `readOnly`, `writeOnly`, `format`, `x-…`) change nothing, so such a schema keeps the plain
  reference.
- OpenAPI 3.0 documents are not changed: their spec says that keywords next to a `$ref` are
  ignored.

#### root-type-numbering

`--root-types --root-types-no-schema-prefix` names each root alias after its schema, in
PascalCase. Two schemas can get one name (`PetStore` and `pet_store`). Without the fix the later
schema takes the name and the earlier one has no alias, as in openapi-typescript. With it the
earlier ones get the next free number, in document order:

```ts
export type PetStore = components['schemas']['pet_store'];
export type PetStore_2 = components['schemas']['PetStore']; // [!code ++]
```

- The shared name keeps its schema, so code that uses it does not change; the fix only adds
  exports, after the other root aliases.
- A number that another alias has is skipped (`PetStore_3`).
- A shared name that an enum, a helper or a TypeScript global type such as `Record` already has
  is numbered with or without the fix (`Record_2`); the earlier schemas get the numbers after it.
- With the prefix the names do not clash (`SchemaPetStore`, `SchemaPetStore_2`), so the fix needs
  `--root-types` and `--root-types-no-schema-prefix` and changes nothing without them; naming it
  without them prints the warning `FIX_NEEDS_OPTION` (`--fix all` does not).

#### unevaluated-properties

Without the fix, `unevaluatedProperties` is ignored: its value type is lost, and an object with
only that keyword is `Record<string, never>`. With it, the keys that no other keyword declares get
its type, as `additionalProperties` gives:

::: code-group

```yaml [my-openapi-3-schema.yaml]
components:
  schemas:
    Labels:
      type: object
      unevaluatedProperties: { type: string }
    Annotated:
      allOf:
        - $ref: "#/components/schemas/Resource"
      properties:
        kind: { type: string, enum: [annotated] }
      unevaluatedProperties: { type: string }
```

:::

```ts
Labels: Record<string, never>; // [!code --]
Labels: { [key: string]: string }; // [!code ++]
Annotated: { kind?: "annotated" } & components["schemas"]["Resource"]; // [!code --]
Annotated: { kind?: "annotated" } & components["schemas"]["Resource"] & { // [!code ++]
  [key: string]: string | "annotated" | undefined | PropertyValues<components["schemas"]["Resource"]>; // [!code ++]
}; // [!code ++]
```

- TypeScript checks an index signature against every key of a value, declared ones too. So the
  index type also holds the types of the declared properties, of the schema and of its `allOf`,
  `anyOf` and `oneOf` members, and a valid value stays assignable. For a `$ref` member it is
  `PropertyValues<T>`, a helper type the file declares once (`T[keyof T]` for each member of a
  union). A key that no keyword declares can then hold any of those types; TypeScript has no type
  for "the other keys".
- `true` and `{}` give `unknown` values. `false` adds nothing, like `additionalProperties: false`:
  TypeScript has no closed object type.
- Next to `additionalProperties` it changes nothing: that keyword types every other key already.
- Only an object schema gets it; in a type list such as `[object, "null"]`, the object does and
  `null` stays outside.
- With `--immutable` the index signature is `readonly`.

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

await client.POST("/users", {
  // Error: 'id' is readOnly, so a request body cannot have it
  body: { id: 123, name: "Alice", password: "secret" },
});

const { data } = await client.GET("/users/{id}", { params: { path: { id: 1 } } });
// Error: 'password' is writeOnly, so the response data does not have it
console.log(data?.password);
```

:::
