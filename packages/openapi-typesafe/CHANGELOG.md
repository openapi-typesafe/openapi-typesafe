# openapi-typesafe

This package is a fork of `openapi-typescript`. The entries above `7.13.0` are releases of openapi-typesafe; `7.13.0` and the entries below it are the upstream history up to the fork point (upstream commit `d46a319a`), with `openapi-typescript` versions.

## 1.0.0-rc.10

### Patch Changes

- [#123](https://github.com/openapi-typesafe/openapi-typesafe/pull/123) [`e6f4e04`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e6f4e04d3e00ab32cdc2730ca892d05d98b9c9dc) Thanks [@fedorello](https://github.com/fedorello)! - An empty `--output` or `--redocly` (`-o "$OUT"` with `OUT` unset, `--output=`, a trailing `-o`)
  now fails with `CLI_FLAG_INVALID` and exit code `2`. It used to write the types to stdout, or look
  for another `redocly.yaml`, without a word.

- [#123](https://github.com/openapi-typesafe/openapi-typesafe/pull/123) [`e6f4e04`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e6f4e04d3e00ab32cdc2730ca892d05d98b9c9dc) Thanks [@fedorello](https://github.com/fedorello)! - An empty schema argument, such as `openapi-typesafe "$SPEC"` with `SPEC` unset, now fails with
  `CLI_LOCATION_INVALID` and exit code `2`. It used to read stdin, so a URL on stdin that does not
  parse failed with the wrong code and the printed lines named a blank source. A `SCHEMA_SOURCE_INVALID`
  error for a URL that does not parse also no longer gets the advice for a YAML string on stdin.

- [#125](https://github.com/openapi-typesafe/openapi-typesafe/pull/125) [`bb44f4c`](https://github.com/openapi-typesafe/openapi-typesafe/commit/bb44f4ca3f578bc97ee433acc8b2ce9261e9b8f2) Thanks [@fedorello](https://github.com/fedorello)! - `--enum`: a numbered tuple element enum no longer takes the name of another property's enum. With
  a tuple property `sort` of two enums next to an enum property `sort_2`, the tuple's second element
  took `HolderSort_2`, so the `sort_2` enum was renamed to `HolderSort_2_2`. `sort_2` now keeps
  `HolderSort_2`, and the element gets the next free number. Tuple elements are also numbered by
  their position in the tuple: a `$ref` to the second element that the generator met first no
  longer swapped the names (`[Tup_2, Tup]`).

- [#123](https://github.com/openapi-typesafe/openapi-typesafe/pull/123) [`e6f4e04`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e6f4e04d3e00ab32cdc2730ca892d05d98b9c9dc) Thanks [@fedorello](https://github.com/fedorello)! - The Node API now rejects options of the wrong type with `OPTION_INVALID` before anything runs: a
  Redocly config that was not made with `createConfig` or `loadConfig` (such as `{ extends: [...] }`),
  an `inject` that is no string, a callback that is no function, and a boolean option that is not
  `true` or `false`. A Redocly config or `inject` of the wrong type used to reject with a plain
  `TypeError`, and `enum: "false"` turned enums on.

- [#123](https://github.com/openapi-typesafe/openapi-typesafe/pull/123) [`e6f4e04`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e6f4e04d3e00ab32cdc2730ca892d05d98b9c9dc) Thanks [@fedorello](https://github.com/fedorello)! - With several APIs in `redocly.yaml`, a `root` that is not a valid URL now fails with a line that
  starts with `API <name>:`, as other failures of an API do. A `local-ref-root` that is not a valid
  URL fails that API with `CLI_CONFIG_INVALID`, and `--local-ref-root` with `CLI_FLAG_INVALID`
  naming the flag, as their other bad values do; both failed with a `CLI_LOCATION_INVALID` that
  named neither.

- [#125](https://github.com/openapi-typesafe/openapi-typesafe/pull/125) [`bb44f4c`](https://github.com/openapi-typesafe/openapi-typesafe/commit/bb44f4ca3f578bc97ee433acc8b2ce9261e9b8f2) Thanks [@fedorello](https://github.com/fedorello)! - A `$ref` into a property of a schema whose `oneOf` variants only list required fields now
  compiles. With `oneOf: [{ required: [email] }, { required: [phone] }]` next to `properties` (the
  "one of these fields is required" pattern), or with variants that are only `{ type: object }`, a
  `$ref` to `Contact/properties/owner/properties/name` was written `Contact["owner"]["name"]`, which
  fails through the optional `owner` (TS2339). It is now `NonNullable<Contact["owner"]>["name"]`.
  The same holds with the `anyof-oneof-required` fix.

- [#123](https://github.com/openapi-typesafe/openapi-typesafe/pull/123) [`e6f4e04`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e6f4e04d3e00ab32cdc2730ca892d05d98b9c9dc) Thanks [@fedorello](https://github.com/fedorello)! - A relative `file:` URL given as text (`openapiTS("file:api.yaml", { cwd: "https://host/specs/" })`)
  with a `cwd` that is an `http:` or `https:` URL now rejects with `SCHEMA_SOURCE_INVALID`. It used to
  read `/api.yaml` from the file system root. A `localRefRoot` such as `"file:specs/"` with such a
  `cwd` rejects with `OPTION_INVALID`, as a relative path does, instead of limiting `$ref`s to `/specs/`.

## 1.0.0-rc.9

### Patch Changes

- [#117](https://github.com/openapi-typesafe/openapi-typesafe/pull/117) [`0345166`](https://github.com/openapi-typesafe/openapi-typesafe/commit/034516664fe4da93abb582618f2f768a2496dce9) Thanks [@fedorello](https://github.com/fedorello)! - `--enum`: a numbered enum name no longer takes the name of a component schema. With a tuple
  `Pair` of two enums and a separate enum schema `Pair_2`, the tuple's second element took `Pair_2`,
  so the schema's enum was declared as `Pair_2_2`. The schema now keeps `Pair_2`, and the element
  gets `Pair_3`.

- [#117](https://github.com/openapi-typesafe/openapi-typesafe/pull/117) [`0345166`](https://github.com/openapi-typesafe/openapi-typesafe/commit/034516664fe4da93abb582618f2f768a2496dce9) Thanks [@fedorello](https://github.com/fedorello)! - `--enum`: the elements of a `prefixItems` tuple get their own enums wherever the tuple is. Before,
  only a tuple that is a whole component schema got `[Pair, Pair_2]`; a tuple in a property, an
  `items`, an `anyOf` / `oneOf` member, a parameter or a response body still declared one enum name
  twice (`export enum HolderSort`), which TypeScript merged, so each element accepted the values of
  the other. `--dedupe-enums` did the same. Such a tuple now gives `[HolderSort, HolderSort_2]`, and a
  `$ref` to one of its elements uses that element's enum.

- [#117](https://github.com/openapi-typesafe/openapi-typesafe/pull/117) [`0345166`](https://github.com/openapi-typesafe/openapi-typesafe/commit/034516664fe4da93abb582618f2f768a2496dce9) Thanks [@fedorello](https://github.com/fedorello)! - `--enum-values`: an array whose schema sits next to an object, an array or a tuple in an `anyOf`
  / `oneOf` (or a `prefixItems` tuple) is now typed by its own values. Before, an enum `[a, b]` next
  to `{ type: object }` typed the items of `["a", "b"]` as `"a" | "b" | Record<string, never>`, so a
  string method on an item did not compile. It is now `ReadonlyArray<"a" | "b">`.

- [#117](https://github.com/openapi-typesafe/openapi-typesafe/pull/117) [`0345166`](https://github.com/openapi-typesafe/openapi-typesafe/commit/034516664fe4da93abb582618f2f768a2496dce9) Thanks [@fedorello](https://github.com/fedorello)! - A `$ref` to a `false` schema (`additionalProperties: false`, `unevaluatedProperties: false`,
  `items: false`) no longer prints a "Could not resolve $ref" warning (`REF_NOT_FOUND`) with the
  `read-write-refs` fix or `--fix=all`. The `$ref` resolved all along; only the warning was wrong.

- [#117](https://github.com/openapi-typesafe/openapi-typesafe/pull/117) [`0345166`](https://github.com/openapi-typesafe/openapi-typesafe/commit/034516664fe4da93abb582618f2f768a2496dce9) Thanks [@fedorello](https://github.com/fedorello)! - A `$ref` into a property of a schema with `properties` next to `oneOf` or `anyOf` now compiles.
  `#/components/schemas/Pet/properties/owner/properties/name`, where `Pet` has a `oneOf` (the usual
  discriminator shape), was written `Pet["owner"]["name"]`, which fails through the optional `owner`
  (TS2339). It is now `NonNullable<Pet["owner"]>["name"]`. Where the type is a union whose member
  does not have the property (`anyOf` without the `anyof-properties` fix), the `$ref` gets the
  type it points at.

- [#115](https://github.com/openapi-typesafe/openapi-typesafe/pull/115) [`4efc594`](https://github.com/openapi-typesafe/openapi-typesafe/commit/4efc594ab40d71c409d5db63d06a29cb649fee58) Thanks [@fedorello](https://github.com/fedorello)! - A schema given as text that is only a location (a string, a `Buffer`, a stream, or stdin in the
  CLI) now follows the same rule as the CLI's schema argument. A relative `file:` URL such as
  `file:api.yaml` loads that file from `cwd` (the current directory in the CLI) instead of failing
  with `SCHEMA_SOURCE_INVALID`. On stdin, a URL that does not parse (`http://[::1/x`) fails with
  `CLI_LOCATION_INVALID` and exit code `2`, as the schema argument does. Text with whitespace is
  always a document, so YAML whose first key looks like a URL (`http://host/a: b`) is parsed as
  YAML instead of being loaded as a URL.

## 1.0.0-rc.8

### Patch Changes

- [#108](https://github.com/openapi-typesafe/openapi-typesafe/pull/108) [`25523e2`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25523e2b6f757941069034818317adbd11d4d86a) Thanks [@fedorello](https://github.com/fedorello)! - A `$ref` into a property of a schema with a `discriminator`, such as
  `#/components/schemas/Pet/properties/owner/properties/name` or `Pet/properties/tags/items`, now
  compiles without `--fix`. It was written as `Pet["owner"]["name"]` or `Pet["tags"]["items"]`, which
  fails with TS2339; it now gets `NonNullable<Pet["owner"]>["name"]` and
  `NonNullable<Pet["tags"]>[number]`, as for a schema without a `discriminator`.

- [#108](https://github.com/openapi-typesafe/openapi-typesafe/pull/108) [`25523e2`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25523e2b6f757941069034818317adbd11d4d86a) Thanks [@fedorello](https://github.com/fedorello)! - `--enum`: the elements of a `prefixItems` tuple no longer share one enum name. Before,
  `prefixItems: [{ enum: [asc, desc] }, { enum: [name, date] }]` declared `export enum Pair` twice,
  which TypeScript merged into one enum, so each element accepted the values of the other. An element
  whose values differ from an earlier one's now gets a number (`[Pair, Pair_2]`); elements with the
  same values still share one enum.

- [#108](https://github.com/openapi-typesafe/openapi-typesafe/pull/108) [`25523e2`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25523e2b6f757941069034818317adbd11d4d86a) Thanks [@fedorello](https://github.com/fedorello)! - `--enum-values` arrays of a `prefixItems` element or of an `anyOf` / `oneOf` member are typed by
  their own values where the place of their schema also admits the values of the other elements or
  members. Before, `prefixItems: [{ enum: [asc, desc] }, { enum: [name, date] }]` typed both arrays by
  the whole tuple, so `"date"` was accepted as an item of the first one, and with
  `--fix=prefix-items` an open tuple accepted any value. The same holds for `oneOf` members that
  narrow a property their parent also lists (`status: [queued, done]` next to members with `[done]`
  and `[queued]`), also next to an object property without properties. Arrays whose place admits
  exactly their values keep their type.

- [#106](https://github.com/openapi-typesafe/openapi-typesafe/pull/106) [`de21136`](https://github.com/openapi-typesafe/openapi-typesafe/commit/de21136e4683aa65b5fd2903f2698fa03c4263bd) Thanks [@fedorello](https://github.com/fedorello)! - A `--no-` flag in another letter case or spelling, such as `--no-Output`, `--no-OUTPUT`,
  `--no-Local_Ref_Root` or `--no-O`, is now an unknown flag: it gets a notice and changes nothing, as
  `--no-Enum` does, instead of failing with `CLI_FLAG_INVALID`. A removed flag in another spelling
  (`--Immutable-Types`) is unknown too; `--immutable-types`, `--immutableTypes` and
  `--no-immutable-types` still fail with `CLI_FLAG_REMOVED`, and `--no-output` and `--no-localRefRoot`
  still fail with `CLI_FLAG_INVALID`.

- [#108](https://github.com/openapi-typesafe/openapi-typesafe/pull/108) [`25523e2`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25523e2b6f757941069034818317adbd11d4d86a) Thanks [@fedorello](https://github.com/fedorello)! - A `$ref` to `#/components/schemas/<Name>/unevaluatedProperties` now gets the type of that schema.
  Without `--fix=unevaluated-properties` it was `<Name>["unevaluatedProperties"]`, which fails with
  TS2339 (or is `never` for an object with no other keywords); with that fix it compiled but read the
  index signature, which also holds the types of the declared properties, so it accepted values the
  schema does not allow.

- [#106](https://github.com/openapi-typesafe/openapi-typesafe/pull/106) [`de21136`](https://github.com/openapi-typesafe/openapi-typesafe/commit/de21136e4683aa65b5fd2903f2698fa03c4263bd) Thanks [@fedorello](https://github.com/fedorello)! - A schema given as text that is a URL (a string, a `Buffer`, a stream, or stdin in the CLI) is now
  loaded exactly like that `URL`. A `file:` URL that names no local path (`file://host/a.yaml`,
  `file:///a%2Fb.yaml`) fails with `SCHEMA_LOAD_FAILED` instead of a plain `TypeError` (in the CLI,
  "Unexpected error" with exit code 70). A remote root that redirects to another host loads with
  `remoteRefHosts: []` or `--remote-ref-hosts ""`, as it does for a `URL`. And
  `echo file://$PWD/api.yaml | openapi-typesafe -o api.yaml` fails with `CLI_OUTPUT_IS_INPUT`
  instead of overwriting the schema with the types.

## 1.0.0-rc.7

### Patch Changes

- [#99](https://github.com/openapi-typesafe/openapi-typesafe/pull/99) [`c7a783f`](https://github.com/openapi-typesafe/openapi-typesafe/commit/c7a783f127337dcdd13f1c69d9155f6841c836ed) Thanks [@fedorello](https://github.com/fedorello)! - The declarations type-check in a CommonJS project without `esModuleInterop` (`module: commonjs`,
  `moduleResolution: node`, `skipLibCheck: false`). The exported `c` was declared with a default
  import of `ansi-colors`, which TypeScript reported as error TS1259.

- [#100](https://github.com/openapi-typesafe/openapi-typesafe/pull/100) [`f50618b`](https://github.com/openapi-typesafe/openapi-typesafe/commit/f50618b6c6ffd6e23495f3183820216ac8709dd0) Thanks [@fedorello](https://github.com/fedorello)! - `--enum-values` with `--path-params-as-types`: an enum parameter of a templated path is checked
  against its own path. With another templated path before it (`/users/{id}` ahead of
  `/orders/{id}`), the generator read the first path instead, warned `ENUM_VALUES_EXCLUDED` for an
  enum the document does not contradict, and typed the array by its values; the result depended on
  the order of the paths. The array is now typed by its path's location
  (``FlattenedDeepRequired<paths>[`/orders/${number}`]…``) whatever the order, and no warning is
  given.

- [#100](https://github.com/openapi-typesafe/openapi-typesafe/pull/100) [`f50618b`](https://github.com/openapi-typesafe/openapi-typesafe/commit/f50618b6c6ffd6e23495f3183820216ac8709dd0) Thanks [@fedorello](https://github.com/fedorello)! - `--enum-values`: the array of an `additionalProperties` enum next to `properties` or
  `patternProperties` is typed by its own values (`ReadonlyArray<"x" | "y">`). It was typed as
  `FlattenedDeepRequired<components>["schemas"]["Stats"][string]`, which reads the whole index
  signature, the property and pattern types included, so `5` was accepted as an item of an enum of
  strings.

  The same holds for an `unevaluatedProperties` enum with the `unevaluated-properties` fix, also
  next to `allOf`, `anyOf` or `oneOf`, whose property types that signature holds too.

- [#99](https://github.com/openapi-typesafe/openapi-typesafe/pull/99) [`c7a783f`](https://github.com/openapi-typesafe/openapi-typesafe/commit/c7a783f127337dcdd13f1c69d9155f6841c836ed) Thanks [@fedorello](https://github.com/fedorello)! - A `file:` URL that names no local path (`file://specs/a.yaml`, where `file:specs/a.yaml` was meant,
  or `file:///a%2Fb.yaml`) no longer crashes the CLI with a stack trace and exit code 70. As the
  schema with `--output`, it fails with `SCHEMA_LOAD_FAILED`, as it does without `--output`. In
  `redocly.yaml`, such a `root` or `output` fails only its own API, and the other APIs are generated.

- [#99](https://github.com/openapi-typesafe/openapi-typesafe/pull/99) [`c7a783f`](https://github.com/openapi-typesafe/openapi-typesafe/commit/c7a783f127337dcdd13f1c69d9155f6841c836ed) Thanks [@fedorello](https://github.com/fedorello)! - A flag written in another case or with `_` (`--Enum`, `--ALPHABETIZE`, `--root_types`,
  `--enum-Values`, `--Output`) is an unknown flag: it takes no value, changes nothing, and the notice
  names it as you wrote it. It used to take the schema path as its value and read stdin, and the notice
  named the known flag (`Unknown flag --enum is ignored`). The kebab-case and camelCase spellings
  (`--root-types`, `--rootTypes`) work as before.

- [#100](https://github.com/openapi-typesafe/openapi-typesafe/pull/100) [`f50618b`](https://github.com/openapi-typesafe/openapi-typesafe/commit/f50618b6c6ffd6e23495f3183820216ac8709dd0) Thanks [@fedorello](https://github.com/fedorello)! - A `$ref` through an index signature that holds more than its target's type is typed as the target
  by default in more places: to the `additionalProperties` of an object under `$defs`
  (`D/$defs/Inner/additionalProperties`) or of an object with a `discriminator`, to the
  `additionalProperties` of an object that also has `patternProperties`, to one of several
  patterns (which did not compile), and with `--exclude-deprecated` to a left-out property of an
  object with a `discriminator`. These read the whole index signature (`boolean | string` for a
  `boolean` target), so a wrong value was accepted.

- [#99](https://github.com/openapi-typesafe/openapi-typesafe/pull/99) [`c7a783f`](https://github.com/openapi-typesafe/openapi-typesafe/commit/c7a783f127337dcdd13f1c69d9155f6841c836ed) Thanks [@fedorello](https://github.com/fedorello)! - A local `$ref` root that is a `file:` URL naming no local path (`file://host/specs/`) now fails
  before anything loads: `localRefRoot` with `OPTION_INVALID`, `--local-ref-root` with
  `CLI_FLAG_INVALID` and `local-ref-root` in `redocly.yaml` with `CLI_CONFIG_INVALID`. It used to pass
  and fail later with `SCHEMA_INVALID`, and only when the document had a local `$ref`.

- [#99](https://github.com/openapi-typesafe/openapi-typesafe/pull/99) [`c7a783f`](https://github.com/openapi-typesafe/openapi-typesafe/commit/c7a783f127337dcdd13f1c69d9155f6841c836ed) Thanks [@fedorello](https://github.com/fedorello)! - The lint ignore file applies again to a remote document that redirects. `.redocly.lint-ignore.yaml`
  lists its problems by the URL you asked for, as `redocly lint --generate-ignore-file` writes it, and
  the ignored problems came back and failed the run with `SCHEMA_INVALID` when `/dup` redirected to
  `/deep/dup.yaml`. Relative `$ref`s still resolve from the URL the document was redirected to.

- [#101](https://github.com/openapi-typesafe/openapi-typesafe/pull/101) [`7b4ba3f`](https://github.com/openapi-typesafe/openapi-typesafe/commit/7b4ba3f783c16e506d4c9afbfe6392b1e820b1e4) Thanks [@fedorello](https://github.com/fedorello)! - A wrapper whose options are typed `Parameters<typeof openapiTS>[1]` gives its inline
  `postTransform` and `transformProperty` callbacks their parameter types again, as with
  openapi-typescript 7, instead of an implicit `any` that `strict` rejects (TS7006).

## 1.0.0-rc.6

### Patch Changes

- [#91](https://github.com/openapi-typesafe/openapi-typesafe/pull/91) [`b3fcff5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/b3fcff541be5f8ddd0bbea19b95a60df26fda92e) Thanks [@fedorello](https://github.com/fedorello)! - A `$ref` to the `additionalProperties` of an object that also has `properties`
  (`#/components/schemas/Stats/additionalProperties`) is typed as that schema again. Since the index
  signature also takes the property types, `Stats["additionalProperties"]` read
  `number | { count?: number }`, which accepted `5`, and a `$ref` one level deeper
  (`.../additionalProperties/properties/count`) did not compile, also with `--fix ref-pointers`.

- [#92](https://github.com/openapi-typesafe/openapi-typesafe/pull/92) [`cf9c4db`](https://github.com/openapi-typesafe/openapi-typesafe/commit/cf9c4db102193818022a30b46d6476bef2f98a93) Thanks [@fedorello](https://github.com/fedorello)! - With several APIs in `redocly.yaml`, an error about an output file (`OUTPUT_STALE`,
  `OUTPUT_READ_FAILED`, `OUTPUT_WRITE_FAILED`, `CLI_OUTPUT_INVALID`, `CLI_OUTPUT_IS_INPUT`,
  `CLI_OUTPUT_DUPLICATE`) starts with `API <name>:`, as the other errors of an API do.

- [#92](https://github.com/openapi-typesafe/openapi-typesafe/pull/92) [`cf9c4db`](https://github.com/openapi-typesafe/openapi-typesafe/commit/cf9c4db102193818022a30b46d6476bef2f98a93) Thanks [@fedorello](https://github.com/fedorello)! - `--check` compares lines, not line ends: an output that Git checked out with CRLF line ends
  (`core.autocrlf` on Windows) is no longer reported as stale (`OUTPUT_STALE`).

- [#92](https://github.com/openapi-typesafe/openapi-typesafe/pull/92) [`cf9c4db`](https://github.com/openapi-typesafe/openapi-typesafe/commit/cf9c4db102193818022a30b46d6476bef2f98a93) Thanks [@fedorello](https://github.com/fedorello)! - A path with a colon in its name, such as `-o out:v2.ts` or the schema `spec:v2.yaml`, is read as a
  file path. Any text before a colon was taken as a URL scheme, so the output failed with
  `CLI_OUTPUT_INVALID`. A location is a URL when it starts with `http:`, `https:` or `file:`, or with
  a scheme and `//`.

- [#92](https://github.com/openapi-typesafe/openapi-typesafe/pull/92) [`cf9c4db`](https://github.com/openapi-typesafe/openapi-typesafe/commit/cf9c4db102193818022a30b46d6476bef2f98a93) Thanks [@fedorello](https://github.com/fedorello)! - Warnings and errors on stderr get colors only when stderr is a terminal. A log file that stderr
  was redirected to got color escape sequences whenever stdout was a terminal.

- [#92](https://github.com/openapi-typesafe/openapi-typesafe/pull/92) [`cf9c4db`](https://github.com/openapi-typesafe/openapi-typesafe/commit/cf9c4db102193818022a30b46d6476bef2f98a93) Thanks [@fedorello](https://github.com/fedorello)! - The Node API's `cwd` option is read like `localRefRoot`: a string such as `"file:///app/specs/"` is
  a URL, where it was read as a relative path. A `cwd` of another type (a number), a URL of another
  scheme, or a relative `localRefRoot` with an `http:` `cwd` rejects with `OPTION_INVALID` instead of
  resolving a wrong directory or throwing a plain `TypeError`.

- [#91](https://github.com/openapi-typesafe/openapi-typesafe/pull/91) [`b3fcff5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/b3fcff541be5f8ddd0bbea19b95a60df26fda92e) Thanks [@fedorello](https://github.com/fedorello)! - `--enum-values` with `--path-params-as-types`: the arrays of a path with a `number` or `boolean`
  path parameter compile. Their type indexed `FlattenedDeepRequired<paths>["/items/{id}"]`, a key
  the type does not have (TS2339); it is now indexed by the path's template
  (``FlattenedDeepRequired<paths>[`/items/${number}`]``), as a `$ref` into that path already was.

- [#91](https://github.com/openapi-typesafe/openapi-typesafe/pull/91) [`b3fcff5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/b3fcff541be5f8ddd0bbea19b95a60df26fda92e) Thanks [@fedorello](https://github.com/fedorello)! - With `--exclude-deprecated`, a `$ref` to a property it leaves out is typed as that property's
  schema also when the object has `additionalProperties`. It was read through the index signature,
  so a `type: string` property was typed as the `additionalProperties` type (`number`), without an
  error.

- [#92](https://github.com/openapi-typesafe/openapi-typesafe/pull/92) [`cf9c4db`](https://github.com/openapi-typesafe/openapi-typesafe/commit/cf9c4db102193818022a30b46d6476bef2f98a93) Thanks [@fedorello](https://github.com/fedorello)! - A second schema argument fails with the new error `CLI_INPUT_EXTRA` (exit code 2). Only the first
  one was generated, so an unquoted glob that the shell expanded (`g/*.yaml`) generated one schema and
  passed.

- [#93](https://github.com/openapi-typesafe/openapi-typesafe/pull/93) [`25f631d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25f631d8dabed24e18a859b08e8395496e145118) Thanks [@fedorello](https://github.com/fedorello)! - Inline `postTransform` and `transformProperty` callbacks in `openapiTS(source, { … })` without
  `irCallbacks` get their parameter types again (`ts.TypeNode`, `ts.PropertySignature`) instead of
  an implicit `any` that `strict` rejects (TS7006), as with openapi-typescript 7.

- [#92](https://github.com/openapi-typesafe/openapi-typesafe/pull/92) [`cf9c4db`](https://github.com/openapi-typesafe/openapi-typesafe/commit/cf9c4db102193818022a30b46d6476bef2f98a93) Thanks [@fedorello](https://github.com/fedorello)! - The `--no-` form of a flag that takes a value (`--no-output`, `--no-redocly`, `--no-fix`,
  `--no-local-ref-root`, `--no-remote-ref-hosts`) fails with `CLI_FLAG_INVALID`. It used the text
  `false` as the value: `--no-output` wrote the types to a file named `false`.

- [#91](https://github.com/openapi-typesafe/openapi-typesafe/pull/91) [`b3fcff5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/b3fcff541be5f8ddd0bbea19b95a60df26fda92e) Thanks [@fedorello](https://github.com/fedorello)! - A `$ref` to one pattern of `patternProperties`
  (`#/components/schemas/Labels/patternProperties/^label_`) compiles without `--fix`: it is typed as
  that pattern's schema instead of `components["schemas"]["Labels"]["patternProperties"]["^label_"]`
  (TS2339).

- [#92](https://github.com/openapi-typesafe/openapi-typesafe/pull/92) [`cf9c4db`](https://github.com/openapi-typesafe/openapi-typesafe/commit/cf9c4db102193818022a30b46d6476bef2f98a93) Thanks [@fedorello](https://github.com/fedorello)! - With several APIs in `redocly.yaml`, each API is linted with its own `rules` (and other lint
  settings) from `apis.<name>`, as `redocly lint <name>` lints it. Every API was linted with the
  root rules only.

- [#92](https://github.com/openapi-typesafe/openapi-typesafe/pull/92) [`cf9c4db`](https://github.com/openapi-typesafe/openapi-typesafe/commit/cf9c4db102193818022a30b46d6476bef2f98a93) Thanks [@fedorello](https://github.com/fedorello)! - Remote `$ref` documents whose queries end in the same text after a `/` (a branch such as
  `?ref=feature/new-api`) are each named after their own file. The pet document was named after the
  owner document (`components["schemas"]["owner"]`), and the owner one `owner-2`.

- [#92](https://github.com/openapi-typesafe/openapi-typesafe/pull/92) [`cf9c4db`](https://github.com/openapi-typesafe/openapi-typesafe/commit/cf9c4db102193818022a30b46d6476bef2f98a93) Thanks [@fedorello](https://github.com/fedorello)! - Relative `$ref`s of a remote document that redirects resolve from the URL it was redirected to.
  A spec URL `https://host/latest` that redirects to `/static/v1/root.yaml` loaded `./pet.yaml` from
  `https://host/pet.yaml`, which gave the types of another file or failed with a 404.

- [#92](https://github.com/openapi-typesafe/openapi-typesafe/pull/92) [`cf9c4db`](https://github.com/openapi-typesafe/openapi-typesafe/commit/cf9c4db102193818022a30b46d6476bef2f98a93) Thanks [@fedorello](https://github.com/fedorello)! - An unknown flag before the schema no longer takes the schema path as its value:
  `--alphabetise api.yaml -o out.ts` prints the notice for the flag and generates `api.yaml`, where it
  read stdin instead. A schema path that looks like a number (`1.10`, `0x10`) is read as written.

## 1.0.0-rc.5

### Patch Changes

- [#70](https://github.com/openapi-typesafe/openapi-typesafe/pull/70) [`d732870`](https://github.com/openapi-typesafe/openapi-typesafe/commit/d732870a9e1d207761c88614a95b778c4f0ebe9d) Thanks [@fedorello](https://github.com/fedorello)! - With several APIs in `redocly.yaml`, an error while an API is loaded or generated starts with
  `API <name>:`, as its config errors do, so it tells which API failed. The code and the exit code
  stay the same. Every warning, problem and debug line of an API's generation (a `$ref` it cannot
  resolve, a lint problem) starts with `API <name>:` too. A notice that a root-types flag has no
  effect follows the CLI flags together with each API's settings and names the API, and an invalid
  `--local-ref-root` fails the run once instead of once for each API.

- [#70](https://github.com/openapi-typesafe/openapi-typesafe/pull/70) [`d732870`](https://github.com/openapi-typesafe/openapi-typesafe/commit/d732870a9e1d207761c88614a95b778c4f0ebe9d) Thanks [@fedorello](https://github.com/fedorello)! - Types piped to a reader that stops early (`openapi-typesafe api.yaml | head`) no longer crash the
  CLI with `EPIPE` and exit code `1`; the rest is dropped and the exit code stays `0`.

- [#70](https://github.com/openapi-typesafe/openapi-typesafe/pull/70) [`d732870`](https://github.com/openapi-typesafe/openapi-typesafe/commit/d732870a9e1d207761c88614a95b778c4f0ebe9d) Thanks [@fedorello](https://github.com/fedorello)! - CLI flags are read by their names:
  - A removed flag fails with `CLI_FLAG_REMOVED` written with a value too (`--redoc=redocly.yaml`),
    in camelCase (`--immutableTypes`) and with `--no-` (`--no-immutable-types`).
  - The boolean alias `-t` (`--export-type`) takes `=true` and `=false` as the flag does; another
    value fails with `CLI_FLAG_INVALID`.
  - A boolean flag takes no value, or `=true` or `=false`. Another value (`--enum=1`,
    `--no-enum=true`) fails with `CLI_FLAG_INVALID` (exit code `2`) instead of turning the flag off.
  - A flag given more than once takes the last value; `--output` and `--redocly` no longer fail with
    a list.
  - The notice that a root-types flag has no effect without `--root-types` follows the parsed flags:
    `--rootTypes` and `--root-types=true` count, `--root-types=false` does not.

- [#76](https://github.com/openapi-typesafe/openapi-typesafe/pull/76) [`e464bc3`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e464bc3c9dcb243a4259307d6b667bde134d8468) Thanks [@fedorello](https://github.com/fedorello)! - A schema argument is a glob pattern, which fails with `CLI_GLOB_UNSUPPORTED`, only when it is a
  path with a `*` that names no file. A URL with a `*` in its query (`…/openapi?fields=*`) and an
  existing file whose name has a `*` are read as any other schema.

- [#70](https://github.com/openapi-typesafe/openapi-typesafe/pull/70) [`d732870`](https://github.com/openapi-typesafe/openapi-typesafe/commit/d732870a9e1d207761c88614a95b778c4f0ebe9d) Thanks [@fedorello](https://github.com/fedorello)! - `--output` together with the APIs of `redocly.yaml` warns with `CLI_OUTPUT_IGNORED`: each API is
  written to its `x-openapi-ts.output`, and the `--output` path was ignored without a word.

- [#76](https://github.com/openapi-typesafe/openapi-typesafe/pull/76) [`e464bc3`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e464bc3c9dcb243a4259307d6b667bde134d8468) Thanks [@fedorello](https://github.com/fedorello)! - The line for a written file and the notices about flags show a line break or an escape sequence in
  a file name, a flag or an API name as an escape (`\n`, `\u001b`), as warnings and errors already
  do, so a name cannot start a forged line in a CI log.

- [#71](https://github.com/openapi-typesafe/openapi-typesafe/pull/71) [`2a03b07`](https://github.com/openapi-typesafe/openapi-typesafe/commit/2a03b072bf201e5e6eeec9ad9744a3f9d513b78a) Thanks [@fedorello](https://github.com/fedorello)! - `const: null` is typed `null`; it was `unknown`, as if the schema had no `const`.

- [#71](https://github.com/openapi-typesafe/openapi-typesafe/pull/71) [`2a03b07`](https://github.com/openapi-typesafe/openapi-typesafe/commit/2a03b072bf201e5e6eeec9ad9744a3f9d513b78a) Thanks [@fedorello](https://github.com/fedorello)! - `--enum --dedupe-enums` no longer merges enums with other values. Their key joined the member
  names and descriptions as text, and a member name stood in for its value, so `Flag` (`1`, `0`)
  became the `Status` enum (`"A"`, `"I"`) when both named their members `Active` and `Inactive`, and
  `["1", "2"]` and `[1, 2]`, or `["a", "b"]` and `["a:,b"]`, shared one enum. The key also paired
  the values in sorted order with the names in document order, so `[desc, asc]` and `[asc, desc]`,
  both named `[Desc, Asc]`, shared one enum and one of them typed `asc` as `Desc = "desc"`. Enums
  with the same values and member names are still merged.

- [#71](https://github.com/openapi-typesafe/openapi-typesafe/pull/71) [`2a03b07`](https://github.com/openapi-typesafe/openapi-typesafe/commit/2a03b072bf201e5e6eeec9ad9744a3f9d513b78a) Thanks [@fedorello](https://github.com/fedorello)! - The new fix `default-input-locations` finds parameters and request bodies by the document's
  structure for `--default-non-nullable` (on by default). Without it, as in openapi-typescript, a
  defaulted property stays optional wherever its location holds the word `parameters` or
  `requestBody`, such as a response of `/system-parameters` or a property named `hyperparameters`.
  It changes nothing with `--default-non-nullable=false`, so naming it then prints the warning
  `FIX_NEEDS_OPTION`, as other fixes that need a flag do (`--fix all` does not).

- [#71](https://github.com/openapi-typesafe/openapi-typesafe/pull/71) [`2a03b07`](https://github.com/openapi-typesafe/openapi-typesafe/commit/2a03b072bf201e5e6eeec9ad9744a3f9d513b78a) Thanks [@fedorello](https://github.com/fedorello)! - With `--exclude-deprecated`, a `$ref` to a property it leaves out
  (`#/components/schemas/A/properties/old`) is typed as that property's schema, instead of naming a
  key the type no longer has. The same holds for a `$ref` into a deprecated operation or response
  header, and a `$ref` through another `$ref` (`Wrap/properties/o/properties/v`, where `o` is a
  `$ref`) no longer warns `REF_NOT_FOUND`. With `--make-paths-enum`, `ApiPaths` lists only the
  operations that `paths` keeps.

- [#71](https://github.com/openapi-typesafe/openapi-typesafe/pull/71) [`2a03b07`](https://github.com/openapi-typesafe/openapi-typesafe/commit/2a03b072bf201e5e6eeec9ad9744a3f9d513b78a) Thanks [@fedorello](https://github.com/fedorello)! - `--fix exploded-query-objects`: an exploded object with `additionalProperties` next to other query
  parameters no longer makes the whole `query` type unusable. Its index signature also takes the
  value types of the other query keys (`{ page?: number } & Partial<{ [key: string]: string | number
| undefined }>`), since TypeScript checks it against `page` too. A `$ref` to such an object is
  written out in place when other query keys are next to it.

- [#71](https://github.com/openapi-typesafe/openapi-typesafe/pull/71) [`2a03b07`](https://github.com/openapi-typesafe/openapi-typesafe/commit/2a03b072bf201e5e6eeec9ad9744a3f9d513b78a) Thanks [@fedorello](https://github.com/fedorello)! - An index signature from `additionalProperties` or `patternProperties` also takes the types of the
  properties next to it that it does not admit (`{ total: number } & { [key: string]: string |
number }`). TypeScript checks the signature against the declared keys too, so the old type took no
  value with those properties.

- [#76](https://github.com/openapi-typesafe/openapi-typesafe/pull/76) [`e464bc3`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e464bc3c9dcb243a4259307d6b667bde134d8468) Thanks [@fedorello](https://github.com/fedorello)! - A YAML parse error of a string source or a stream (stdin in the CLI) names it `the schema string`
  or `the schema stream`. It named `<cwd>/inline-source`, a file that does not exist.

- [#71](https://github.com/openapi-typesafe/openapi-typesafe/pull/71) [`2a03b07`](https://github.com/openapi-typesafe/openapi-typesafe/commit/2a03b072bf201e5e6eeec9ad9744a3f9d513b78a) Thanks [@fedorello](https://github.com/fedorello)! - A discriminator `mapping` value that names a schema (`cat: Cat`), as OpenAPI allows, is read as
  `#/components/schemas/Cat`, also in a document a `$ref` loads, where it names that document's
  schemas. It failed with "Can't resolve $ref"; any other value is still a URI reference. A `mapping`
  inside `example`, `examples`, `default`, `const`, `enum` or an `x-` value is data and stays as
  written. A problem in a document other than the root now names that document: its path, or its URL
  without the query.

- [#71](https://github.com/openapi-typesafe/openapi-typesafe/pull/71) [`2a03b07`](https://github.com/openapi-typesafe/openapi-typesafe/commit/2a03b072bf201e5e6eeec9ad9744a3f9d513b78a) Thanks [@fedorello](https://github.com/fedorello)! - The `parameter-content` fix is now `parameter-header-content` and types a response header with
  `content` by the schema of its media type too (`"X-Rate": { limit: number }`), not as a map of
  media types. Configs that name `parameter-content` fail with `OPTION_FIX_UNKNOWN` until renamed.

- [#71](https://github.com/openapi-typesafe/openapi-typesafe/pull/71) [`2a03b07`](https://github.com/openapi-typesafe/openapi-typesafe/commit/2a03b072bf201e5e6eeec9ad9744a3f9d513b78a) Thanks [@fedorello](https://github.com/fedorello)! - `--path-params-as-types` with only `boolean` path parameters in a path compiles:
  ``[path: `/flags/${boolean}`]`` is no valid index signature (TS1337), so such a path is written as
  the keys `"/flags/true"` and `"/flags/false"`, with the same path item type (2ⁿ keys for n boolean
  parameters). A key that the document already has as a path is left out. Next to another parameter
  (`` `/a/${number}/${boolean}` ``) the signature is valid and stays as it was.

- [#71](https://github.com/openapi-typesafe/openapi-typesafe/pull/71) [`2a03b07`](https://github.com/openapi-typesafe/openapi-typesafe/commit/2a03b072bf201e5e6eeec9ad9744a3f9d513b78a) Thanks [@fedorello](https://github.com/fedorello)! - `--path-params-as-types`: a `$ref` into a path with a `number` or `boolean` path parameter
  compiles. It was typed as `paths["/pets/{id}"]`, which names no key of
  ``[path: `/pets/${number}`]`` (TS2339); it is now ``paths[`/pets/${number}`]``. A boolean path
  is indexed by the keys it is written with (`paths["/flags/true" | "/flags/false"]`), without the
  one a path of the document takes, so the `$ref` no longer gets that path's type too. With only
  string parameters the URL matches the template, so that output stays as it was.

- [#75](https://github.com/openapi-typesafe/openapi-typesafe/pull/75) [`a74608e`](https://github.com/openapi-typesafe/openapi-typesafe/commit/a74608ec36b0a938594e0d0fac10c9fb222c1742) Thanks [@fedorello](https://github.com/fedorello)! - `Readable` and `Writable` find the `$Read` and `$Write` properties of an object with an index
  signature (`additionalProperties`). The keys were read through the index signature, so no
  property was marked: a request body required the `readOnly` `id`, and a response kept the
  `writeOnly` password. The helper types that `--read-write-markers` writes are fixed the same way.

- [#70](https://github.com/openapi-typesafe/openapi-typesafe/pull/70) [`d732870`](https://github.com/openapi-typesafe/openapi-typesafe/commit/d732870a9e1d207761c88614a95b778c4f0ebe9d) Thanks [@fedorello](https://github.com/fedorello)! - The `$ref` limits are checked before anything loads:
  - In the Node API, a `remoteRefHosts` that is no list of strings, or a `localRefRoot` that is no
    path or `file:` URL, fails with `OPTION_INVALID` and `details.option`. It failed later as an error
    of the document, such as `hosts.map is not a function`.
  - `--local-ref-root https://…` fails with `CLI_FLAG_INVALID` (exit code `2`) instead of exit code
    `3`, and a `local-ref-root` URL of another protocol in `redocly.yaml` with `CLI_CONFIG_INVALID`.
  - In the Node API, a `localRefRoot` string with a scheme is a URL, as for `--local-ref-root`:
    `"file:///specs/"` is that directory, not a path below `cwd`, and `"https://…"` fails with
    `OPTION_INVALID`.

- [#75](https://github.com/openapi-typesafe/openapi-typesafe/pull/75) [`a74608e`](https://github.com/openapi-typesafe/openapi-typesafe/commit/a74608ec36b0a938594e0d0fac10c9fb222c1742) Thanks [@fedorello](https://github.com/fedorello)! - More `$ref`s into a schema compile and get the type they point at:
  - A `$ref` into the `content` of a header or parameter follows the generated type: the media type
    member of a header (`components["headers"]["H"]["text/plain"]`), or with the
    `parameter-header-content` fix the media type's type itself. A parameter typed `string` and
    `content` next to a `schema` are typed in place. Before, `["content"]["text/plain"]["schema"]`
    did not compile (TS2339).
  - With `--read-write-markers`, a `$ref` through an optional property gets `NonNullable` as
    without the flag; one through a `$Read` or `$Write` property is typed in place.
  - A `$ref` through a property with a `default` that the output makes optional (in a request body,
    or under a property named `hyperparameters`) gets `NonNullable`: the property is read as
    optional or required by where it is, not where the `$ref` is.

- [#71](https://github.com/openapi-typesafe/openapi-typesafe/pull/71) [`2a03b07`](https://github.com/openapi-typesafe/openapi-typesafe/commit/2a03b072bf201e5e6eeec9ad9744a3f9d513b78a) Thanks [@fedorello](https://github.com/fedorello)! - `--fix ref-siblings` also reads the keywords next to the `$ref` of an object property
  (`owner: { $ref: Base, required: [id] }` is `WithRequired<Base, "id">`); it read them only for
  components, array items, bodies and parameters.

- [#66](https://github.com/openapi-typesafe/openapi-typesafe/pull/66) [`15344bf`](https://github.com/openapi-typesafe/openapi-typesafe/commit/15344bfb803ff9872a6d3f79b8279fbbbbfd14ea) Thanks [@fedorello](https://github.com/fedorello)! - A remote `$ref` to a document served as `text/plain` loads when its URL has a query after the
  extension (`pet.yaml?token=…`), no extension at all (`/schemas/pet`) or a dot that names no text
  format (`/schemas/v1.0`, `/schemas/pet.v2`); before, it was kept as text and failed with
  `Expected SchemaObject, received string`. A URL whose extension or type names a text format
  (`.md`, `.markdown`, `.txt`, `.html`, `.htm`, `text/markdown`, `text/html`) stays text, as a
  Markdown `description` does.

- [#71](https://github.com/openapi-typesafe/openapi-typesafe/pull/71) [`2a03b07`](https://github.com/openapi-typesafe/openapi-typesafe/commit/2a03b072bf201e5e6eeec9ad9744a3f9d513b78a) Thanks [@fedorello](https://github.com/fedorello)! - A webhook that is a `$ref` (often to `components/pathItems`) is typed as the path item it points
  at, as a `$ref` in `paths` is: `petAdded: components["pathItems"]["PetEvent"]`. Every method of
  such a webhook was `never`.

## 1.0.0-rc.4

### Minor Changes

- [#49](https://github.com/openapi-typesafe/openapi-typesafe/pull/49) [`e12bc23`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e12bc2323d5e61a2755af13ed9939db589c18151) Thanks [@fedorello](https://github.com/fedorello)! - An `--output` or `x-openapi-ts.output` that cannot be a file fails with the new error code
  `CLI_OUTPUT_INVALID` (exit code `2`) before anything is generated: a URL of another scheme
  (`-o https://…`), a path that ends with a separator (`-o gen/`) or with `.` or `..`
  (`-o gen/.`), or an existing directory. openapi-typescript failed on them with `EISDIR` or a
  stack trace, or wrote a file named like the directory. An output that cannot be written (a file name too long
  for the file system) leaves no new directories behind; openapi-typescript left them.

- [#39](https://github.com/openapi-typesafe/openapi-typesafe/pull/39) [`a4a1104`](https://github.com/openapi-typesafe/openapi-typesafe/commit/a4a110406891ecd37e39b23f01838f74233adca1) Thanks [@fedorello](https://github.com/fedorello)! - The CLI no longer overwrites a file it should not. Both checks follow symlinks and hard links,
  and the letter case of a file system that ignores case (asked of the file system, not assumed from
  the OS), also for outputs that do not exist yet. They run before anything is written and fail with
  exit code `2`. openapi-typescript checked neither:
  - An `--output`, or an `x-openapi-ts.output` in `redocly.yaml`, that names a file the CLI
    reads fails with the new error code `CLI_OUTPUT_IS_INPUT`: the schema, a local file one of
    its `$ref`s loads, or `redocly.yaml`. With several APIs, every API is read before any output
    is written, and no output may be a file that any API reads. openapi-typescript replaced the
    file with the types.
  - APIs in `redocly.yaml` whose outputs are the same file all fail with the new error code
    `CLI_OUTPUT_DUPLICATE`; the other APIs are still generated. openapi-typescript let the API
    that finished last win. Before writing, the CLI creates every missing output, empty, and asks
    the file system whether two of them are one file, so names that differ only in Unicode
    normalization or case folding (`café.ts` in NFC and NFD, `straße.ts` and `STRASSE.ts`) or a
    path through a link to a missing directory are caught too. A run that fails this way leaves no
    new file or directory.

- [#50](https://github.com/openapi-typesafe/openapi-typesafe/pull/50) [`90e2668`](https://github.com/openapi-typesafe/openapi-typesafe/commit/90e2668f1ac2fe7093fa9bd1858ac1e1aceb8184) Thanks [@fedorello](https://github.com/fedorello)! - Remote documents have size limits. The loader reads each body as a stream and counts the bytes
  after `gzip`, `deflate` or `br` is decoded, so a compressed "zip bomb" behind a remote `$ref` no
  longer fills the memory: 1.6 MB on the wire became 1.6 GB before. A body larger than 128 MiB, or
  remote documents larger than 256 MiB together for one schema, fail with `SCHEMA_REF_FORBIDDEN` and
  the new reasons `remote-document-too-large` and `remote-documents-too-large`. The parser also
  counts the nodes it builds: remote documents that parse into more than 8,000,000 nodes together
  fail with the new reason `remote-documents-too-many-nodes`, so a dense body such as
  `[{},{},…]` within the byte limits no longer ends the process with an out-of-memory crash.
  The largest real document we know is 71 MiB and 2.65 million nodes. A `customFetch` in the
  Redocly config is limited too.

### Patch Changes

- [#53](https://github.com/openapi-typesafe/openapi-typesafe/pull/53) [`5e1d76a`](https://github.com/openapi-typesafe/openapi-typesafe/commit/5e1d76a67d8b64aaa16683d7caed8dfdc9cae297) Thanks [@fedorello](https://github.com/fedorello)! - A key that contains `#/`, such as a path `/items/#/%zz`, a property `a#/b` or a parameter name,
  no longer makes the generator throw `URIError: URI malformed`. openapi-typescript read such a key
  as a `$ref`; now it is one segment of the pointers the generator builds, so an `--enum-values`
  array of such a key points at its own node. The exported `createRef` keeps the old behaviour. The
  new enum names of such keys are listed under Major Changes.

  These pointers, and the ones in the generator's errors, escape `#` as `%23` and `%` as `%25`
  (RFC 6901), so a key like `a#` no longer cuts a pointer short. A discriminator `mapping` to a
  schema whose name has a `%`, such as `50%`, no longer throws `URIError` either.

- [#49](https://github.com/openapi-typesafe/openapi-typesafe/pull/49) [`e12bc23`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e12bc2323d5e61a2755af13ed9939db589c18151) Thanks [@fedorello](https://github.com/fedorello)! - `silent: true` in the Node API also hides the problem lines of a document that fails to load,
  such as `Can't resolve $ref`; the rejected `SCHEMA_INVALID` error lists them in
  `details.problems`. openapi-typescript printed them to stderr even with `silent`.

## 1.0.0-rc.3

### Patch Changes

- [#30](https://github.com/openapi-typesafe/openapi-typesafe/pull/30) [`7650cd9`](https://github.com/openapi-typesafe/openapi-typesafe/commit/7650cd982433fc2c36acc7a4092fe49456e81cdf) Thanks [@fedorello](https://github.com/fedorello)! - Every deprecation of something 2.0 removes is now a Node.js `DeprecationWarning` with an
  `OPENAPI_TYPESAFE_DEP_*` code, shown once per process. The TypeScript-node forms of `transform`,
  `postTransform` and `transformProperty` used to print a warning line with the code
  `LEGACY_CALLBACK_DEPRECATED` through the generator's logger; they now emit
  `OPENAPI_TYPESAFE_DEP_TS_TRANSFORM`, `OPENAPI_TYPESAFE_DEP_TS_POST_TRANSFORM` and
  `OPENAPI_TYPESAFE_DEP_TS_TRANSFORM_PROPERTY`, as `stringToAST()` emits
  `OPENAPI_TYPESAFE_DEP_STRING_TO_AST`. `node --no-deprecation` hides them, `--throw-deprecation`
  makes them errors, and `silent` no longer hides them. The new `DEPRECATION_CODES` export lists the
  codes; `STRING_TO_AST_DEPRECATION_CODE` and the `LEGACY_CALLBACK_DEPRECATED` warning code, which
  only rc versions had, are removed.

- [#30](https://github.com/openapi-typesafe/openapi-typesafe/pull/30) [`7650cd9`](https://github.com/openapi-typesafe/openapi-typesafe/commit/7650cd982433fc2c36acc7a4092fe49456e81cdf) Thanks [@fedorello](https://github.com/fedorello)! - The types generated for the OpenAPI 3.2 additions (`query` operations, `additionalOperations`,
  `itemSchema`, `in: querystring`, `components.mediaTypes`) are experimental in 1.x: a minor release
  may change their shape, for example to match openapi-typescript once it supports 3.2, and its
  changelog says so. The output of documents without these keys, `client.QUERY()` and the `"query"`
  member of `HttpMethod` keep the full semver promise.

- [#30](https://github.com/openapi-typesafe/openapi-typesafe/pull/30) [`7650cd9`](https://github.com/openapi-typesafe/openapi-typesafe/commit/7650cd982433fc2c36acc7a4092fe49456e81cdf) Thanks [@fedorello](https://github.com/fedorello)! - The fix names are exported as the `OutputFix` union, the `OUTPUT_FIXES` list and `OutputFixName`
  (a fix name or `"all"`), as ADR-021 describes. The `OutputFix` object (`OutputFix.ALLOF_REQUIRED`)
  and the `ALL_OUTPUT_FIXES` constant, which only rc versions had, are removed: write the fix names
  as strings, for example `fix: ["allof-required"]` or `fix: ["all"]`.

- [#29](https://github.com/openapi-typesafe/openapi-typesafe/pull/29) [`a74808d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/a74808dd891f435e860ffabb24947b75238e9d40) Thanks [@fedorello](https://github.com/fedorello)! - The `@redocly/openapi-core` range is `^1.34.22` again. In 1.0.0-rc.2 it was `^1.34.23`, which a
  package manager with a minimum release age (for example bun's `minimum-release-age` of 7 days)
  refused while that version was new.

## 1.0.0-rc.2

### Minor Changes

- [#15](https://github.com/openapi-typesafe/openapi-typesafe/pull/15) [`5837bac`](https://github.com/openapi-typesafe/openapi-typesafe/commit/5837baca3bbcd58bd132622d9a4723e97bc5a9bc) Thanks [@fedorello](https://github.com/fedorello)! - Every warning ends with a stable code (exported as `WARNING_CODES`); lint warnings name their
  Redocly rule. New warnings, which change neither output nor exit code: a repeated `operationId`,
  paths that differ only in parameter names, a discriminator value its member does not allow, an
  unknown `x-openapi-ts` key, and an unknown CLI flag.

### Patch Changes

- [#16](https://github.com/openapi-typesafe/openapi-typesafe/pull/16) [`cd79dbd`](https://github.com/openapi-typesafe/openapi-typesafe/commit/cd79dbd39d33dc913ec101a4c46560dff801da4e) Thanks [@fedorello](https://github.com/fedorello)! - The type declarations keep their JSDoc, so editors show descriptions and mark deprecated exports.

- [#15](https://github.com/openapi-typesafe/openapi-typesafe/pull/15) [`5837bac`](https://github.com/openapi-typesafe/openapi-typesafe/commit/5837baca3bbcd58bd132622d9a4723e97bc5a9bc) Thanks [@fedorello](https://github.com/fedorello)! - The declarations type-check with TypeScript 7 and `skipLibCheck: false`.

- [#23](https://github.com/openapi-typesafe/openapi-typesafe/pull/23) [`54c59f2`](https://github.com/openapi-typesafe/openapi-typesafe/commit/54c59f233907bf75a61419b1ff933094e790b852) Thanks [@fedorello](https://github.com/fedorello)! - The deprecated `resolveRef` takes the document as `unknown` instead of `any`, so any value is still
  accepted. It now returns the node when a `$ref` that is not a string is found, instead of failing.

## 1.0.0-rc.1

### Patch Changes

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - New output fix `allof-discriminated-union` (`--fix allof-discriminated-union`, ADR-021): a schema
  that `allOf`s a discriminated `oneOf` or `anyOf` it is not a member of is typed as that union.
  Before, it got `Omit<Union, "pet_type">`, which keeps only the keys every member has, and a value
  of its own schema name (`{ pet_type: "B" } & …`) that no member allows, so
  `B: { pet_type: "B" } & Omit<components["schemas"]["A"], "pet_type">` is now
  `B: components["schemas"]["A"]` (openapi-typescript
  [#1464](https://github.com/openapi-ts/openapi-typescript/issues/1464),
  [#1690](https://github.com/openapi-ts/openapi-typescript/issues/1690)). A schema that the union's
  `mapping` names is a member and stays as it was. A schema that only reuses the union gets no
  `DISCRIMINATOR_VALUE_NOT_ALLOWED` warning for a value it does not get. Without the fix the output
  does not change; `--fix all` now includes it.

- [#11](https://github.com/openapi-typesafe/openapi-typesafe/pull/11) [`578bd5d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/578bd5df6e6937cc3a8870a78ff84bfa6837f0b7) Thanks [@fedorello](https://github.com/fedorello)! - The CLI with a `redocly.yaml` or a `.redocly.lint-ignore.yaml` that cannot be parsed printed
  "Unexpected error" with a stack trace and exited with 70, the code for a bug. It now prints one
  line that names the file and the reason, with the new error code `CLI_CONFIG_INVALID`, and exits
  with 2, the code for a wrong Redocly config.

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - The CLI without a schema path or URL, without `apis` in `redocly.yaml` and with nothing piped into
  stdin (stdin is a terminal) now fails at once with exit code `2` and `CLI_INPUT_MISSING`. Before,
  it waited for a schema typed into the terminal with no prompt, which looked like a hang
  (openapi-typescript [#1905](https://github.com/openapi-ts/openapi-typescript/issues/1905)). A
  schema piped into stdin is read as before.

- [#8](https://github.com/openapi-typesafe/openapi-typesafe/pull/8) [`ff6b717`](https://github.com/openapi-typesafe/openapi-typesafe/commit/ff6b717836b81e929295a4db4e731221e17322ac) Thanks [@fedorello](https://github.com/fedorello)! - The CLI reads a path as a path: a `#`, `?` or `%` in the schema path, in `--output`, `--redocly`,
  `--local-ref-root` or in a `redocly.yaml` `root` or `output` is part of the file name. Before, the
  path was parsed as a URL, so `specs/#v2/api.yaml` read `specs/` and `a%20b.yaml` read `a b.yaml`.
  A one-letter scheme is a Windows drive, so `C:\specs\api.yaml` is a path. URLs (`https:`, `file:`)
  work as before.

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - A discriminated `oneOf` or `anyOf` whose members `allOf` it now compiles (openapi-typescript
  [#1665](https://github.com/openapi-ts/openapi-typescript/issues/1665)). Each member was typed as
  `Omit<Union, "type"> & …`, and the union contains the member, so TypeScript failed with "is
  referenced directly or indirectly in its own type annotation" (TS2502). A member now gets the
  union's own properties instead (`{ id?: string } & { age?: number } & { type: "CAT" }`), or none
  when the union has only the discriminator property. A union that inherits its discriminator
  through `allOf` gets no value of its own (`kind: "Pet"`), which made every member `never`. On by
  default: only output that did not
  compile changes.

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - A schema that inherits a discriminator through `allOf` and declares the discriminator property in
  its own `properties` got the property twice in one object type (`class: "Child"; class?:
"Child";`), and the output did not compile (TS2300). The schema's own declaration is now kept,
  required as a discriminator property must be. Output that compiled stays the same.

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - New output fix `discriminator-member-required` (`--fix discriminator-member-required`, ADR-021):
  `required` next to an `allOf` `$ref` keeps `WithRequired` when the target is also a member of a
  discriminated `oneOf`. Before, a discriminator elsewhere in the document dropped it, so
  `Cat: WithRequired<components["schemas"]["CatProps"], "kittens">` became
  `Cat: components["schemas"]["CatProps"]` and `kittens` stayed optional (openapi-typescript
  [#2162](https://github.com/openapi-ts/openapi-typescript/issues/2162)). The discriminator property
  itself is required in the target already and is not repeated. Without the fix the output does not
  change; `--fix all` now includes it.

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - A discriminator member whose value (its mapping key, or its schema name without one) its own
  property `enum` or `const` does not allow now gets a warning that names the Discriminator Object
  rule and the mapping entry to add (`DISCRIMINATOR_VALUE_NOT_ALLOWED`). No value of such a schema matches the discriminator. A member that inherits
  the discriminator through an `allOf` chain (`Lion` of `Cat` of `Pet`) is checked too.

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - The output fix `discriminator-values` (`--fix discriminator-values`, ADR-021, ADR-024) now
  corrects every case of the value a discriminator member gets. Projects that list it in rc.0 get
  new output:
  - A schema that defines a discriminator with a `mapping` and also `allOf`s another discriminator
    owner keeps its own discriminator. Before, the inherited one replaced it, so the schemas listed
    after the owner got their schema name instead of the mapped value (`contentType:
"JDocumentContentModel"` instead of `"jDocument"`), and the output depended on the order of the
    schemas (openapi-typescript [#2200](https://github.com/openapi-ts/openapi-typescript/issues/2200)).
    A discriminator of another property that the owner inherits still gives its members a value:
    `Video` of `Content` (which owns `subtype`) of `Element` (which owns `contentType`) gets both.
    Its value of the other property is its own (`contentType: "Video"` when no mapping names it),
    also when `Element`'s mapping names `Content`: `Content`'s `"content"` is left out of `Video`.
  - A member that already requires the property with exactly its values (`enum: [agent]` or
    `const: agent`) gets no second, added property: `{ type: "agent" }`, not
    `{ type: "agent" } & { type: "agent" }`
    ([#2124](https://github.com/openapi-ts/openapi-typescript/issues/2124)).
  - With `--enum`, when the owner's property is an enum (`petType: { $ref: PetType }`), a member's
    value is a member of that enum, `petType: PetType.Cat`, with or without a mapping. Before, each
    member declared an enum of its own (`CatPetType`) or got the string `"Cat"`, and neither is
    assignable to `PetType`, so a `Cat` was not a `Pet`
    ([#1700](https://github.com/openapi-ts/openapi-typescript/issues/1700)). A value from a
    discriminator that declares no such property (a `oneOf` with a `mapping`) is a member of the
    enum the member inherits. With `--dedupe-enums`, a shared enum keeps the name it has without
    the fix (`OtherK`, not the owner's `PetPetType`).

  Without the fix the output does not change; `--fix all` includes it.

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - `--enum`: two enums that got one name, such as those of a property and an inline `allOf` item of
  one schema, were declared twice with the same member names, and the output did not compile
  (TS2300). TypeScript merges the declarations, so a later one now leaves out the members an earlier
  one has, a member whose name an earlier one gives another value gets a number (`a_b_2`), and a
  declaration with nothing new is left out. Output that compiled stays the same.

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - `--enum-values` declares each values array once. A schema typed twice at the same place, such as
  two `prefixItems` entries with the same enum, declared the same `export const …Values` twice, and
  the file failed with "Cannot redeclare block-scoped variable" (TS2451). Output that compiled
  before does not change.

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - `--enum-values` arrays whose type, the location of their schema in the generated types, cannot
  hold their values are typed by their own values (`ReadonlyArray<"a" | "b">`), so the output
  compiles: a schema under `definitions` or an `allOf` member, a property of a schema whose type is
  `unknown`, an `anyOf` array member next to a non-array one, an empty enum (`readonly never[]`), a
  property `--read-write-markers` wraps in `$Read<T>` or `$Write<T>`, or a schema that contradicts
  itself (an `allOf` of different enums, a discriminator value its enum does not list). The last
  case also prints a warning (`ENUM_VALUES_EXCLUDED`). Arrays whose type compiled stay the same
  (ADR-027).

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - `--enum-values`: the type of a values array for an enum under a `oneOf`/`anyOf` variant narrows
  the union with `Extract<T, { name: unknown }>`. A property name that is not an identifier, such as
  `content-type`, was written without quotes there, and the output had a syntax error. It is now
  quoted. Output that compiled stays the same.

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - `--enum-values`: two different arrays that got one name, such as those of `Discount/type` and
  `discount/type`, or of a property and an inline `allOf` item of one schema, declared one `const`
  twice, and the output did not compile (TS2451). The later array now gets a number,
  `discountTypeValues_2`. Output that compiled stays the same.

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - `--enum-values`: the values array of an enum in a path item parameter (`paths`, `webhooks`,
  `components.pathItems`) was typed as `paths["/a"]["parameters"]["parameters"]["path"]["id"]`, which
  does not exist, and the output did not compile (TS2339). It now indexes `parameters` once. The
  array names and output that compiled stay the same.

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - New opt-in fix `anyof-oneof-descriptions` (`--fix anyof-oneof-descriptions`): the JSDoc of a
  property or schema lists the `description` of each `anyOf` and `oneOf` member, which was dropped
  (openapi-typescript [#2142](https://github.com/openapi-typesafe/openapi-typesafe/issues/2142)).

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - New opt-in fix `anyof-oneof-required` (`--fix anyof-oneof-required`): an `anyOf` or `oneOf` whose
  variants have only `required` keys of the sibling `properties` gives the parent with each variant's
  keys required (`WithRequired<Props, "a"> | WithRequired<Props, "b">`) instead of `Props | unknown`,
  which is `unknown`. A key whose property `--exclude-deprecated` leaves out keeps the old output.
  With a `type` list (`[object, "null"]`) only the `object` member gets the keys.

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - New opt-in fix `dedupe-enum-names` (`--enum --dedupe-enums --fix dedupe-enum-names`): a shared
  enum is named by a rule that does not depend on the document order (its component schema, else the
  shortest name, else code-unit order), so adding a schema no longer renames it
  (openapi-typescript [#1683](https://github.com/openapi-typesafe/openapi-typesafe/issues/1683)).

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - New opt-in fix `exploded-query-objects` (`--fix exploded-query-objects`, or `fix:
["exploded-query-objects"]`): a query parameter with an object schema and the default `style: form`,
  `explode: true` is sent as its own keys (`?page=1&size=10`), so its properties become keys of
  `query` instead of one key named after the parameter (openapi-typescript [#2361](https://github.com/openapi-typesafe/openapi-typesafe/issues/2361)). The default
  `querySerializer` of `openapi-typesafe-fetch` already sends this format.

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - New opt-in fix `nullable-enums` (`--enum --fix nullable-enums`): an enum that lists `null` becomes a
  TypeScript enum of its other values, typed `E | null` where the schema allows `null`, instead of
  staying a union (openapi-typescript [#1872](https://github.com/openapi-typesafe/openapi-typesafe/issues/1872)).

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - New opt-in fix `prefix-items` (`--fix prefix-items`): a `prefixItems` tuple follows JSON Schema
  2020-12. It is open unless `items` or `unevaluatedItems` is `false`, further items get the `items`
  type, and elements after `minItems` are optional (openapi-typescript [#1892](https://github.com/openapi-typesafe/openapi-typesafe/issues/1892)).

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - New opt-in fix `read-write-refs` (`--fix read-write-refs`): `readOnly` and `writeOnly` of a schema
  that a property references with `$ref` or `allOf` make the property `readonly` and count for
  `--read-write-markers`, as in OpenAPI 3.0 and 3.1 (openapi-typescript [#1938](https://github.com/openapi-typesafe/openapi-typesafe/issues/1938)).

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - Paths that differ only in their parameter names, such as `/users/{id}` and `/users/{name}`, now
  get a warning, `PATH_TEMPLATES_IDENTICAL`: the OpenAPI Paths Object forbids them. With
  `--path-params-as-types` they share one key type, and when their path items had the same type the
  output repeated the index signature and did not compile (TS2374); each of them is now in an object
  of its own in the `paths` intersection, as paths with different types already were. Warnings about
  the document now end with a code, as errors do: the `in: querystring` warning ends with
  `(QUERYSTRING_NEXT_TO_QUERY)`.

- [#6](https://github.com/openapi-typesafe/openapi-typesafe/pull/6) [`19c5d85`](https://github.com/openapi-typesafe/openapi-typesafe/commit/19c5d85bc6bdc77f7f7165067bf479aba99d32fb) Thanks [@fedorello](https://github.com/fedorello)! - Relative `$ref`s of a string, object, buffer or stream source (and of a schema read from stdin) now
  resolve in `cwd`. openapi-typescript 7.13 and 1.0.0-rc.0 read them from the parent of `cwd`. A
  `cwd` path with `#` or `%` works, and a `cwd` URL without a trailing slash is a directory. A setup
  that kept the shared files one level up must now pass that directory as `cwd` (ADR-023).

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - Lint problems listed in `.redocly.lint-ignore.yaml` no longer fail the run: they are skipped, as
  `redocly lint` skips them (openapi-typescript
  [#2189](https://github.com/openapi-ts/openapi-typescript/issues/2189)). Before, an ignored error
  still stopped the generation with `SCHEMA_INVALID`.

- [#11](https://github.com/openapi-typesafe/openapi-typesafe/pull/11) [`578bd5d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/578bd5df6e6937cc3a8870a78ff84bfa6837f0b7) Thanks [@fedorello](https://github.com/fedorello)! - `--path-params-as-types`: a path whose response is an item of another path's array response
  (`$ref: "#/paths/~1a/get/responses/200/content/application~1json/schema/items"`, written as
  `...["application/json"][number]`) stayed in the `paths` interface under a template that covers
  it, and the output did not compile (TS2413). The overlap check now reads `T[number]` of an array
  as its element, so it sees that an item is no array and moves the template, as rc.0 did.

- [#11](https://github.com/openapi-typesafe/openapi-typesafe/pull/11) [`578bd5d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/578bd5df6e6937cc3a8870a78ff84bfa6837f0b7) Thanks [@fedorello](https://github.com/fedorello)! - `--path-params-as-types`: a `boolean` response under a path that a template with a
  `true | false` response also matches (`enum: [true, false]`) moved the template into a `paths`
  intersection, although TypeScript accepts `boolean` there. The overlap check now reads `boolean`
  as `true | false` against a union, and the output is the same as openapi-typescript 7.13 gives.

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - With `--path-params-as-types`, output where a template also matches a path whose type differs in
  a union, an array item, a tuple or a property type other than an object compiles. It gave TS2413
  for 66 documents of the APIs.guru corpus, Magento and Microsoft Graph among them (upstream [#1752](https://github.com/openapi-typesafe/openapi-typesafe/issues/1752)):
  the overlap check read only methods, parameter locations and required properties. It now compares
  the types the way TypeScript does and writes such a template in an object of its own. Output that
  compiled is unchanged.

- [#11](https://github.com/openapi-typesafe/openapi-typesafe/pull/11) [`578bd5d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/578bd5df6e6937cc3a8870a78ff84bfa6837f0b7) Thanks [@fedorello](https://github.com/fedorello)! - `--path-params-as-types`: a template such as `` `/${string}/${number}` `` next to `/a/b/{n}` was
  moved into a `paths` intersection, although that output compiles. The overlap check matched the
  keys by trying every split of the text; TypeScript matches each text of the template at its first
  occurrence and never checks `` `/a/b/${number}` `` against that template. The check now follows
  TypeScript's matching only, so the output is the same as openapi-typescript 7.13 gives.
  A template of only `${boolean}` placeholders, which is no index signature (TS1337), no longer
  moves another template either.

- [#11](https://github.com/openapi-typesafe/openapi-typesafe/pull/11) [`578bd5d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/578bd5df6e6937cc3a8870a78ff84bfa6837f0b7) Thanks [@fedorello](https://github.com/fedorello)! - `--path-params-as-types` is fast on large documents again. The overlap check compared every pair of
  paths, which took over four minutes for Microsoft Graph beta (about 10 000 paths); it now compares
  a template only with the paths that start with its first text, and takes seconds.

- [#11](https://github.com/openapi-typesafe/openapi-typesafe/pull/11) [`578bd5d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/578bd5df6e6937cc3a8870a78ff84bfa6837f0b7) Thanks [@fedorello](https://github.com/fedorello)! - `--path-params-as-types`: output that compiled could still change. A template such as
  `` `/a/${string}` `` that also matches `/a/{id}/b` was moved into a `paths` intersection whenever
  the overlap check could not read a type of the covered path, such as `Record<string, never>` for
  an empty object schema, although TypeScript accepts it. The check now moves a template only where
  the covered type surely does not fit; where it cannot tell, the output is the same as
  openapi-typescript 7.13 gives, `export interface paths` included.

- [#11](https://github.com/openapi-typesafe/openapi-typesafe/pull/11) [`578bd5d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/578bd5df6e6937cc3a8870a78ff84bfa6837f0b7) Thanks [@fedorello](https://github.com/fedorello)! - `--path-params-as-types` with a path parameter named `number`, `string` or `boolean`, such as
  `/invoices/{id}/lines/{number}`, now gives the same key as openapi-typescript 7.13,
  `` `/invoices/$${number}/lines/{number}` ``: the original replaces the first `{number}` in the
  key, which is in the placeholder of `{id}`. The rc gave every parameter its own placeholder; that
  key is now the new opt-in fix `path-param-type-names` (`--fix=path-param-type-names`), since both
  outputs compile.

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - `--path-params-as-types`: nested paths such as `/cases/{id}` and `/cases/{id}/summary`, whose
  operations differ only in a referenced response schema, gave output that did not compile (TS2413,
  openapi-typescript [#1752](https://github.com/openapi-typesafe/openapi-typesafe/issues/1752)). The overlap check now reads the `operations` and `components` types the
  paths reference, so such a template gets its own object in the `paths` intersection. Output that
  compiled stays byte-identical. This fix is on by default.

- [#11](https://github.com/openapi-typesafe/openapi-typesafe/pull/11) [`578bd5d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/578bd5df6e6937cc3a8870a78ff84bfa6837f0b7) Thanks [@fedorello](https://github.com/fedorello)! - `--path-params-as-types` with `--fix=prefix-items`: a template that also matches a path whose
  response is an open `prefixItems` tuple, such as `[string?, ...string[]]`, under a `string[]`
  response gave output that did not compile (TS2413). The overlap check took the optional element
  for a `string`; it may be `undefined`, so the template now gets an object of its own.

- [#11](https://github.com/openapi-typesafe/openapi-typesafe/pull/11) [`578bd5d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/578bd5df6e6937cc3a8870a78ff84bfa6837f0b7) Thanks [@fedorello](https://github.com/fedorello)! - `--binary-as-blob` with `--root-types --root-types-no-schema-prefix`: a schema named `Blob` got
  the alias `Blob`, which hid the global type, so every binary body and response silently had the
  type of that schema. Its alias is now `Blob_2`, as a schema named `Record` already gets
  `Record_2`.

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - `--root-types --root-types-no-schema-prefix`: a schema named after a TypeScript global type that
  the output uses, such as `Record`, got an alias of that name (`export type Record = …`). It shadowed
  the global, and every `Record<string, never>` of the output failed to compile (TS2315). The alias is
  now numbered like other root type conflicts (`Record_2`). An alias of a global name that the output
  does not use, and output that compiled, stay the same.

- [#11](https://github.com/openapi-typesafe/openapi-typesafe/pull/11) [`578bd5d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/578bd5df6e6937cc3a8870a78ff84bfa6837f0b7) Thanks [@fedorello](https://github.com/fedorello)! - `--fix=root-type-numbering`: with `--root-types --root-types-no-schema-prefix`, schemas named
  `record` and `Record` gave `Record_2` to `record`, although without the fix `Record_2` is the alias
  of `Record` (the name `Record` itself shadows the global type the output uses). The earlier schemas
  are now numbered after the shared name got its own, so `Record_2` keeps its schema and the fix
  only adds `Record_3`, as the docs promise.

- [#9](https://github.com/openapi-typesafe/openapi-typesafe/pull/9) [`14494f5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/14494f5553575d15ad8f4d54f59ddabddb3a3e01) Thanks [@fedorello](https://github.com/fedorello)! - A schema `$ref` into the keywords of another schema, such as
  `#/paths/~1a/get/responses/200/content/application~1json/schema/items/properties/time`,
  `#/components/schemas/Base/allOf/0/properties/id` or `#/components/schemas/A/definitions/B`, was
  indexed by the keyword names (`["schema"]["items"]`), which the generated types do not have, and did
  not look through optional or nullable values; the output did not compile (TS2339, TS2532, TS2344).
  Where it does not compile, the `schema` of a media type, header or component parameter is now left
  out, `items` is indexed by `number`, `additionalProperties` by `string`, an optional value (also a
  response header without `required: true`) is wrapped in `NonNullable`, and a target behind
  `allOf/N`, `definitions` or operation and path item `parameters/N` is written inline. Output that
  compiled stays the same (ADR-026): a key of `type: object` without properties
  (`Record<string, never>`) is `never` and compiles, so it is kept, and `items` next to
  `type: string` or `type: object` has no type of its own, so its target is written inline. With
  `--enum` an inline target uses the enum the generator declares for that schema, so no second,
  incompatible TypeScript enum (and no second `--enum-values` array) is named after the pointer.
  A pointer that indexes a value typed `unknown` is corrected too: one into a schema with no `type`
  and no object keywords, or, with `--additional-properties`, one past `allOf` of a schema whose parts
  all read `allOf` through `[key: string]: unknown` (`B["allOf"]["0"]`, TS2339).

  New opt-in fix `ref-pointers` (`--fix ref-pointers`): the same type also where the original compiled
  through an index signature (`--additional-properties`) as `unknown`.

- [#8](https://github.com/openapi-typesafe/openapi-typesafe/pull/8) [`ff6b717`](https://github.com/openapi-typesafe/openapi-typesafe/commit/ff6b717836b81e929295a4db4e731221e17322ac) Thanks [@fedorello](https://github.com/fedorello)! - The notice for an unknown negated flag names it as written: `--no-alphabetise` is reported as
  `--no-alphabetise`, not `--alphabetise`.

## 1.0.0-rc.0

### Major Changes

- [#2](https://github.com/openapi-typesafe/openapi-typesafe/pull/2) [`fe3b751`](https://github.com/openapi-typesafe/openapi-typesafe/commit/fe3b75106b6a737a3c54d1e629518a88d40375c9) Thanks [@fedorello](https://github.com/fedorello)! - First release of openapi-typesafe, a maintained fork of openapi-typescript 7.13, openapi-fetch and
  openapi-react-query. The CLI flags, the Node API and the output of valid schemas match
  openapi-typescript 7.13; the changes below are fixes and opt-in features. Version 1.0 makes these
  contracts semver-stable. `npx openapi-typesafe-migrate --write` moves a project over.

### Minor Changes

- [`6fdfcf7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/6fdfcf7d5457dae3deddd3bce76e02a5306408bb) Thanks [@fedorello](https://github.com/fedorello)! - New `--fix` option (`fix` in the Node API and in `redocly.yaml`) for opt-in fixes of the output of
  valid schemas (ADR-021). Give fix names, comma-separated, or `all` for every fix of the installed
  version; an unknown name fails with `OPTION_FIX_UNKNOWN`. Without it the output does not change.
  The fixes become the default in 2.0.

  The first fix, `allof-required`: an `allOf` member with only `required` (and `type: object` or
  annotations), inline or behind a `$ref`, no longer adds `& Record<string, never>` or `& unknown`;
  its keys become required in the other members, so `Info & Record<string, never>` is now
  `WithRequired<Info, "name">` (openapi-typescript [#1474](https://github.com/openapi-typesafe/openapi-typesafe/issues/1474), [#1520](https://github.com/openapi-typesafe/openapi-typesafe/issues/1520), [#2165](https://github.com/openapi-typesafe/openapi-typesafe/issues/2165)). An empty `type: object`
  member is left out too.

- [`51893c4`](https://github.com/openapi-typesafe/openapi-typesafe/commit/51893c44af634b0ff7a122a6d6e5f7001f3727ea) Thanks [@fedorello](https://github.com/fedorello)! - New output fix `anyof-properties` (`--fix anyof-properties`, ADR-021): `anyOf` next to
  `properties`, `additionalProperties` or `allOf` is intersected with them, so
  `{ name?: string } | Email | Phone` is now `{ name?: string } & (Email | Phone)` and a value must
  match a variant (openapi-typescript [#2380](https://github.com/openapi-typesafe/openapi-typesafe/issues/2380)); `type: string` with `anyOf` enums becomes
  `string & ("a" | "b")`. With a `type` list, each listed type is intersected
  and `null` is kept. Without the fix the output does not change; `--fix all` now includes it.

- [`5bf785f`](https://github.com/openapi-typesafe/openapi-typesafe/commit/5bf785f6657f25b00a08a9cb505b44bde076df65) Thanks [@fedorello](https://github.com/fedorello)! - New output fix `array-length-tuples` (`--fix array-length-tuples`, ADR-021), for `--array-length`:
  `minItems: 1, maxItems: 2` gives `[string] | [string, string]` instead of `[] | [string]`; a nested
  array is no longer wrapped twice (`[string[]]`, not `[string[][]]`); with `--immutable` the length
  tuples are `readonly`; and a `prefixItems` tuple is not wrapped in length tuples
  (openapi-typescript [#2048](https://github.com/openapi-typesafe/openapi-typesafe/issues/2048), [#2330](https://github.com/openapi-typesafe/openapi-typesafe/issues/2330), [#2546](https://github.com/openapi-typesafe/openapi-typesafe/issues/2546)). Without `--array-length` the fix changes nothing, and
  naming it prints a notice. Without the fix the output does not change.

- [`a60df75`](https://github.com/openapi-typesafe/openapi-typesafe/commit/a60df750c26f00aa56aee663c9519ec9aae6fa05) Thanks [@fedorello](https://github.com/fedorello)! - New option `--binary-as-blob` (`binaryAsBlob` in the Node API): raw binary strings become `Blob`
  instead of `string`, so file uploads and downloads type check without a `transform` callback.
  Raw binary is `format: binary` (OpenAPI 3.0), or a `contentMediaType` that is not text and has no
  `contentEncoding` (3.1, also without `type`). `format: byte`, encoded strings and text media types
  (`text/*`, JSON, XML, YAML) stay `string`. Off by default, so the output does not change. The
  names follow openapi-typescript PR [#2878](https://github.com/openapi-typesafe/openapi-typesafe/issues/2878) by @joaodibba; closes openapi-typescript#1214.

  The `SchemaObject` type of the Node API gains the OpenAPI 3.1 keywords `contentMediaType` and
  `contentEncoding`.

- [`236ea3f`](https://github.com/openapi-typesafe/openapi-typesafe/commit/236ea3fce582a2befa9be4c04e72d9f70d5a3ade) Thanks [@fedorello](https://github.com/fedorello)! - Report document limits as typed errors instead of crashes or hangs. A document nested too deeply
  for the call stack fails with `SCHEMA_TOO_DEEP`. A `$ref` cycle with no schema in between fails
  with `SCHEMA_REF_INVALID`. Keys such as `valueOf` that the schema loader cannot read fail with
  `SCHEMA_KEY_UNSUPPORTED` and are all listed. A remote `$ref` that does not answer stops after 60
  seconds. See the new Limits section in the advanced guide.

- [`9a9567d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/9a9567daa5c041b0cbf468e72fb95547254bc4e6) Thanks [@fedorello](https://github.com/fedorello)! - Mark the rarely used utility exports `resolveRef`, `scanDiscriminators`, `walk`, `c`, `debug`, `warn` and `error` as `@deprecated`. They keep working in 1.x and are removed in 2.0 (ADR-004, decision 9).

- [`de5f101`](https://github.com/openapi-typesafe/openapi-typesafe/commit/de5f101ef4464ccf85ad1c446046704a4187817e) Thanks [@fedorello](https://github.com/fedorello)! - Add the `discriminator-values` output fix (`--fix discriminator-values`, ADR-021). Without it a
  schema that a `mapping` names and that a discriminated `oneOf` without a mapping also lists gets
  two discriminator properties, the mapped value and the schema name (`kind: "cat"` and
  `kind: "Cat"`), which intersect to `never`. With it the values of a property merge into one enum,
  and the schema name is used only where no mapping gives the schema a value. Without the fix the
  output is unchanged.

- [`fed3f15`](https://github.com/openapi-typesafe/openapi-typesafe/commit/fed3f15371340eff01c9d694f01dbd7028fb863e) Thanks [@fedorello](https://github.com/fedorello)! - **Breaking compared with `openapi-typescript`:** the type helpers (`tsUnion`, `tsIntersection`, `tsNullable`, `tsOmit`, `tsRecord`, `tsLiteral`, `tsWithRequired`, `oapiRef`), the type constants (`STRING`, `NUMBER`, `BOOLEAN`, `NULL`, `UNKNOWN`, `NEVER`, `TRUE`, `FALSE`, `UNDEFINED`) and the exported transformers (`transformSchemaObject`, `transformComponentsObject`, `transformPathsObject` and the others) return IR objects instead of TypeScript compiler nodes. The helpers still accept TypeScript type nodes as input, and `astToString` prints IR, TypeScript nodes or a mix of both. `ctx.injectFooter` holds IR declarations; TypeScript nodes pushed by user callbacks still work. A `transform` or `transformProperty` callback may return IR or TypeScript nodes. Code that passes the constants or helper results into `ts.factory` calls must convert them first or build the whole type with the helpers (see ADR-004).

- [`6d0d224`](https://github.com/openapi-typesafe/openapi-typesafe/commit/6d0d22458bb3ecf341b6801b8ea583ad8695b996) Thanks [@fedorello](https://github.com/fedorello)! - Add the `irCallbacks: true` option (`OpenAPITSIrOptions`). With it, `transform`, `postTransform` and `transformProperty` receive and return IR nodes; a type result may also be TypeScript type text, printed as written. The TypeScript-node forms of `postTransform` and `transformProperty` are deprecated (ADR-004).

- [`099a961`](https://github.com/openapi-typesafe/openapi-typesafe/commit/099a961729ecad1af19b1ed79f9254ebddd0411e) Thanks [@fedorello](https://github.com/fedorello)! - The TypeScript compiler is loaded only when a callback or helper uses TypeScript nodes: from the project's `typescript` (version 6 or earlier), or from `@typescript/typescript6` on TypeScript 7 projects. When neither is installed, the run fails with an error that names both packages. Legacy callbacks warn once per run: `transform` when it returns a TypeScript node, `postTransform` and `transformProperty` whenever they use the TypeScript form.

- [`70eb1b0`](https://github.com/openapi-typesafe/openapi-typesafe/commit/70eb1b0dc03a48e4dc0cc09786c60d23f25fdf15) Thanks [@fedorello](https://github.com/fedorello)! - Add `--no-lint` (CLI) and `lint: false` (Node API, and `x-openapi-ts` per API) to skip the Redocly lint step. Bundling errors still fail the run. Lint stays on by default. Closes upstream [#2840](https://github.com/openapi-typesafe/openapi-typesafe/issues/2840) (design of upstream PR [#2845](https://github.com/openapi-typesafe/openapi-typesafe/issues/2845)).

- [`1fd16d1`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1fd16d12c293c8397512c7bb4ec393eec9ffd276) Thanks [@fedorello](https://github.com/fedorello)! - **Breaking compared with `openapi-typescript`:** `openapiTS()` returns the generated declarations as IR objects (`IrDeclaration[]`) instead of TypeScript compiler nodes. `astToString(await openapiTS(…))` works unchanged and prints them with the package's own printer, byte for byte as before. Code that inspected or edited the returned `ts.Node`s must work with the IR objects instead (see ADR-004).

- [`19e1d9d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/19e1d9d864acbec2ae17446002e2bdd71f19f806) Thanks [@fedorello](https://github.com/fedorello)! - Accept OpenAPI 3.2 documents. The schema loader update to `@redocly/openapi-core` 1.34.22 removed the
  "Unsupported OpenAPI version: 3.2.0" error that `openapi-typescript` 7.13.0 reports (see ADR-005).

- [`9e6f3f1`](https://github.com/openapi-typesafe/openapi-typesafe/commit/9e6f3f116a25f391498316cf6f303531ade6723b) Thanks [@fedorello](https://github.com/fedorello)! - OpenAPI 3.2 features are typed, with no flag (ADR-020): a path item's `query` operation becomes a
  `query` member after `trace` (only where declared), `additionalOperations` a member keyed by the
  exact method name, `itemSchema` an `itemContent` map next to `content` (which keeps the `schema`
  type), an `in: querystring` parameter the `query` member of `parameters`, and
  `components.mediaTypes` a `components` member that `content` entries can reference. Documents that
  use none of these keep their output. The warnings for these features are gone; a `querystring`
  parameter next to `in: query` parameters (not allowed in 3.2) still warns and is not typed.
  `--make-paths-enum` and `--path-params-as-types` include the new operations. A discriminator
  without `propertyName` (allowed in 3.2) no longer omits a property named `undefined`.

  The Node API types gain `query`, `additionalOperations`, `itemSchema`, `in: "querystring"`,
  `components.mediaTypes` and `discriminator.defaultMapping`. Upstream: openapi-typescript#2577,
  PRs [#2683](https://github.com/openapi-typesafe/openapi-typesafe/issues/2683), [#2844](https://github.com/openapi-typesafe/openapi-typesafe/issues/2844), [#2853](https://github.com/openapi-typesafe/openapi-typesafe/issues/2853).

- [`a8c7a1b`](https://github.com/openapi-typesafe/openapi-typesafe/commit/a8c7a1beab8683f7df4cd3d75276fbd48cdb6712) Thanks [@fedorello](https://github.com/fedorello)! - Add opt-in limits for `$ref` in documents you did not write. `--local-ref-root <dir>`
  (`localRefRoot`) loads local `$ref` files only from that directory, and `--remote-ref-hosts
<hosts>` (`remoteRefHosts`) loads remote `$ref` documents only from the listed hosts, including
  each redirect. A refused `$ref` fails with the new error code `SCHEMA_REF_FORBIDDEN`. Without the
  options nothing changes. See "Untrusted documents" in the advanced guide.

- [`53e2c32`](https://github.com/openapi-typesafe/openapi-typesafe/commit/53e2c3237ee0455706e025638cdd4b297b4d7420) Thanks [@fedorello](https://github.com/fedorello)! - Add the `root-type-numbering` output fix (`--fix root-type-numbering`, ADR-021). With `--root-types
--root-types-no-schema-prefix`, schemas of one PascalCase name (`PetStore`, `pet_store`) each get
  a root alias: the later keeps the name, as before, and the earlier get the next free number
  (`PetStore_2`), instead of no alias. It needs both flags and prints a notice without them. Without
  the fix the output is unchanged.

- [`9c69bfc`](https://github.com/openapi-typesafe/openapi-typesafe/commit/9c69bfcbc99a0151f7abd0434e50003ded130c95) Thanks [@fedorello](https://github.com/fedorello)! - Add typed errors: every expected failure is an `OpenAPITypesafeError` with a stable `code` and structured `details` (exported with `ERROR_CODES` and `isOpenAPITypesafeError`). Messages are unchanged; a reader or parser error is kept as `cause` (check `error.cause.code` instead of `error.code === "ENOENT"`). The CLI now prints one line per failure with its code and exits with a documented code: `1` stale output with `--check` (as before), `2` usage or configuration, `3` input document, `4` output files, `70` unexpected error. Other failures used to exit with `1` (ADR-011).

- [`a866985`](https://github.com/openapi-typesafe/openapi-typesafe/commit/a8669856084adf4614c38ce4284ab46e7eb4086e) Thanks [@fedorello](https://github.com/fedorello)! - The generator no longer needs the `typescript` package: it is now an optional peer dependency, next to the optional `@typescript/typescript6` for TypeScript 7 projects. Only legacy callbacks and the deprecated `ts.Node` helpers load it.

  **Breaking compared with `openapi-typescript`:** the `inject` option is printed as written (without the blank lines around it) instead of being reformatted by the TypeScript printer, so comments in it are kept. With `--path-params-as-types`, a backtick in a URL is escaped, so the key is a valid template literal type (the original produced a broken type).

- [`d9e3755`](https://github.com/openapi-typesafe/openapi-typesafe/commit/d9e3755180f55f279dd1879b9c9a1f9f7c52e8b5) Thanks [@fedorello](https://github.com/fedorello)! - Add the `unevaluated-properties` output fix (`--fix unevaluated-properties`, ADR-021). Without it
  `unevaluatedProperties` is ignored, so an object with only that keyword is `Record<string, never>`.
  With it the keys that no other keyword declares get its type through an index signature, which
  also holds the declared property types of the schema and its `allOf`, `anyOf` and `oneOf` members
  (`PropertyValues<T>` for a `$ref`), so valid values stay assignable (openapi-typescript [#2839](https://github.com/openapi-typesafe/openapi-typesafe/issues/2839),
  [#2880](https://github.com/openapi-typesafe/openapi-typesafe/issues/2880)). Without the fix the output is unchanged.

- [`323e9a5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/323e9a567c7ff3ddad7bc7a1bfa39b859e94b296) Thanks [@drwpow](https://github.com/drwpow)! - Add ability to set flags in redocly.yaml

### Patch Changes

- [`ad94710`](https://github.com/openapi-typesafe/openapi-typesafe/commit/ad94710c5c2535f301e13b1aaf82c2447bf64823) Thanks [@fedorello](https://github.com/fedorello)! - Fix `$ref`s to keys with `~`, `/` or `%` in another file (`./parts.yaml#/a~0b`, `#/50%25`).
  The bundled ref named a different key, so the types did not compile, or crashed the generator.
  A local `$ref` with a malformed `%` escape now fails with `SCHEMA_REF_INVALID` and names the ref,
  instead of an unexpected error.

- [`e434933`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e43493399026d9ecfa3088e8139f47f3e930f436) Thanks [@fedorello](https://github.com/fedorello)! - A `transform`, `postTransform` or `transformProperty` callback that returns a value that is not a
  TypeScript node (a plain object, or text from `postTransform`) now fails with
  `CALLBACK_RESULT_UNREADABLE` and names the callback and the schema path, instead of
  `Debug Failure. Unhandled SyntaxKind` or a `TypeError`. `transform` returning text still keeps the
  default type, as in openapi-typescript.

- [`98e6188`](https://github.com/openapi-typesafe/openapi-typesafe/commit/98e618873aa53fd2431f353360a882835c8cb9e3) Thanks [@fedorello](https://github.com/fedorello)! - `--check` without `--output` (and without `apis` in `redocly.yaml`) now fails with exit code 2 and
  `CLI_CHECK_OUTPUT_MISSING`. Before, it printed the types and exited with 0 without checking
  anything, so a CI check could pass by mistake.

- [`07b20a9`](https://github.com/openapi-typesafe/openapi-typesafe/commit/07b20a9378824e669a8d872d4129a424597d4216) Thanks [@fedorello](https://github.com/fedorello)! - CommonJS consumers get types and a working `require()`. The package exports now carry `types` conditions (`index.d.cts` for `require`, `index.d.mts` for `import`), so TypeScript with `"module": "node16"` finds the declarations from a CommonJS file. `engines.node` is now `>=22.12.0`: the CommonJS build loads ESM-only dependencies (`parse-json`, `change-case`, `supports-color`, `yargs-parser`) through `require()`, which Node.js supports without a flag from 22.12. Fixes upstream [#2047](https://github.com/openapi-typesafe/openapi-typesafe/issues/2047), [#2155](https://github.com/openapi-typesafe/openapi-typesafe/issues/2155), [#2342](https://github.com/openapi-typesafe/openapi-typesafe/issues/2342).

- [`c988054`](https://github.com/openapi-typesafe/openapi-typesafe/commit/c9880541b806c85d3d20c90e4ff3d6f0e71b9836) Thanks [@fedorello](https://github.com/fedorello)! - Fix `--check` with several APIs in `redocly.yaml`: the CLI exited with `0` as soon as one output was up to date, so a stale output of another API went unnoticed. Every API is now generated or checked; each failure prints a line, and the exit code is that of the first failing API. The CLI is now TypeScript (ADR-012); it passes only the documented flags to the generator, so undocumented flags such as `--silent` no longer reach the Node API options.

- [`7577f44`](https://github.com/openapi-typesafe/openapi-typesafe/commit/7577f44e417e20d96a8df11f0132d924cbd1daa9) Thanks [@fedorello](https://github.com/fedorello)! - The CLI now warns when two operations share an `operationId`. The generated file declares the
  operation twice in `operations` and does not compile without `skipLibCheck`. The warning does not
  change the output or the exit code; the Node API already rejects such a schema.

- [`626a1d1`](https://github.com/openapi-typesafe/openapi-typesafe/commit/626a1d1ef1ad34df2e2b1ac2b10f0370e4d6d658) Thanks [@fedorello](https://github.com/fedorello)! - Fix kebab-case boolean flags before the schema path (for example `openapi-typesafe --root-types schema.yaml`): the flag took the path as its value, so the CLI waited on stdin. Fixes upstream [#2523](https://github.com/openapi-typesafe/openapi-typesafe/issues/2523), [#1651](https://github.com/openapi-typesafe/openapi-typesafe/issues/1651), [#2764](https://github.com/openapi-typesafe/openapi-typesafe/issues/2764), [#2694](https://github.com/openapi-typesafe/openapi-typesafe/issues/2694).

- [`98e6188`](https://github.com/openapi-typesafe/openapi-typesafe/commit/98e618873aa53fd2431f353360a882835c8cb9e3) Thanks [@fedorello](https://github.com/fedorello)! - The `CLI_GLOB_UNSUPPORTED` and `CLI_CONFIG_OUTPUT_MISSING` messages link to this project's docs
  for multiple schemas instead of the openapi-typescript site.

- [`78024de`](https://github.com/openapi-typesafe/openapi-typesafe/commit/78024decda862937e9521d8099147c9a95885f15) Thanks [@fedorello](https://github.com/fedorello)! - Clearer CLI messages for two failures. A remote schema that cannot be fetched now prints the
  network reason and the URL (`fetch failed: connect ECONNREFUSED … (http://…)`), not only
  `fetch failed`; the Node API error keeps its message and now has the network error in `cause`.
  YAML nested deeper than the parser limit now says to move nested schemas to `components` and
  use `$ref`.

- [`5a01c7e`](https://github.com/openapi-typesafe/openapi-typesafe/commit/5a01c7e0a3db2c2fab97b4ba9544bc0b53bea9f3) Thanks [@fedorello](https://github.com/fedorello)! - The CLI now prints `Unknown flag --x is ignored (see --help)` for each flag it does not know. The
  run still goes on, as before, but a typo such as `--alphabetise` no longer changes the output
  without a word.

- [`ecc50e8`](https://github.com/openapi-typesafe/openapi-typesafe/commit/ecc50e84ee7c14687a48a091f83b0e4e040c8a4a) Thanks [@fedorello](https://github.com/fedorello)! - A schema source nested deeper than the call stack now fails with `SCHEMA_TOO_DEEP` on Node.js 22
  and 24 too. Before, parsing it threw a raw `RangeError` there.

- [`153dff3`](https://github.com/openapi-typesafe/openapi-typesafe/commit/153dff3dd490c09607b1d2377fe916df87427585) Thanks [@fedorello](https://github.com/fedorello)! - Fix `$defs` types. A schema's `$defs` member is now optional (`$defs?: { … }`), so values no
  longer need a `$defs` key, and refs into it use `NonNullable<…>` (upstream [#2664](https://github.com/openapi-typesafe/openapi-typesafe/issues/2664)). The root
  `$defs` now has one member per subschema instead of `Record<string, never>`, so `#/$defs/<name>`
  refs resolve to the subschema type instead of `never`.

- [`374f824`](https://github.com/openapi-typesafe/openapi-typesafe/commit/374f8248e06ebf57ccada0fa0f680253bc787501) Thanks [@fedorello](https://github.com/fedorello)! - `stringToAST()` is deprecated (removed in 2.0). It works as before through the TypeScript bridge and emits one Node `DeprecationWarning` (code `OPENAPI_TYPESAFE_DEP_STRING_TO_AST`). Return TypeScript type text from an IR callback (`irCallbacks: true`) instead.

- [`05aa2de`](https://github.com/openapi-typesafe/openapi-typesafe/commit/05aa2de70187c1a6ccbfc37a45e4f264bca2b4af) Thanks [@fedorello](https://github.com/fedorello)! - `--enum` no longer writes the same discriminator enum twice. A schema that its parent's
  `discriminator.mapping` names and that a discriminated `oneOf` lists got its `…Kind` enum twice,
  and the file failed with "Duplicate identifier". Inherited from openapi-typescript.

- [`93f547f`](https://github.com/openapi-typesafe/openapi-typesafe/commit/93f547f94e3aaa64042b460e4012c28323048d1c) Thanks [@fedorello](https://github.com/fedorello)! - An empty schema file, or a document that is only `null`, now fails with
  `SCHEMA_VERSION_UNSUPPORTED` ("Unsupported schema format, expected `openapi: 3.x`") instead of a
  `TypeError` and exit code 70. Inherited from openapi-typescript.

- [`ed32986`](https://github.com/openapi-typesafe/openapi-typesafe/commit/ed32986f7f062390e755629b74a5bfd615e05061) Thanks [@fedorello](https://github.com/fedorello)! - Fix `--enum` output that did not compile: an empty string value now gives the member `"" = ""`, a member name that must be quoted is escaped (`"\\"` instead of `"\"`), and a line break in `x-enum-descriptions` no longer ends the `//` comment early (it becomes a space). The deprecated `tsEnum` / `tsEnumMember` helpers get the same fixes. Fixes upstream [#2807](https://github.com/openapi-typesafe/openapi-typesafe/issues/2807), [#2812](https://github.com/openapi-typesafe/openapi-typesafe/issues/2812), [#2614](https://github.com/openapi-typesafe/openapi-typesafe/issues/2614), [#2838](https://github.com/openapi-typesafe/openapi-typesafe/issues/2838).

- [`c4d5367`](https://github.com/openapi-typesafe/openapi-typesafe/commit/c4d5367235b49ac76301e3c5953e76c4243f8358) Thanks [@fedorello](https://github.com/fedorello)! - `--enum` and `--make-paths-enum`: values whose member names come out the same after invalid
  characters are replaced (`reactions-+1` and `reactions--1` are both `reactions_1`) gave a
  "Duplicate identifier" error. A repeated name now gets a number (`reactions_1_2`); names that did
  not collide stay the same.

- [`4b88b54`](https://github.com/openapi-typesafe/openapi-typesafe/commit/4b88b546b12cf3a11ffbbb00aa72a2dd4eee2072) Thanks [@fedorello](https://github.com/fedorello)! - Fix `--enum-values` output that did not compile: the `FlattenedDeepRequired` helper now flattens readonly arrays (with `--immutable`) and looks through nullable parent objects, and the `ReadonlyArray` helper accepts readonly arrays. The helper text in the generated footer changes accordingly; the exported types stay the same where they compiled before. Fixes upstream [#2714](https://github.com/openapi-typesafe/openapi-typesafe/issues/2714), [#2749](https://github.com/openapi-typesafe/openapi-typesafe/issues/2749), [#2737](https://github.com/openapi-typesafe/openapi-typesafe/issues/2737).

- [`d1c4913`](https://github.com/openapi-typesafe/openapi-typesafe/commit/d1c4913348cffd6b485ededb01a348385a060b0c) Thanks [@fedorello](https://github.com/fedorello)! - Security: document text can no longer add code to the generated file. With `--root-types`, a quote, backslash or line break in a component name is now escaped in `components['schemas']['…']`. Before, a name such as `A']; export const x = 1; //` added its own declaration. With `--path-params-as-types`, backslashes, `${` and carriage returns in a URL are now escaped in the template literal key; before, a backslash before a backtick ended the literal. Output for other names and URLs is unchanged.

- [`e0ae531`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e0ae531e2df0f7c22e6f0e7e2e7455d4b5bf569c) Thanks [@fedorello](https://github.com/fedorello)! - `--exclude-deprecated`: a deprecated component that kept output still references, such as the
  `items` of a kept array or a kept operation's response, is kept, so the output no longer names a
  missing `components["schemas"]` key (TS2339). A deprecated component that only dropped parts
  reference (deprecated operations, parameters or properties) is still left out.

- [`fffe42b`](https://github.com/openapi-typesafe/openapi-typesafe/commit/fffe42babe4a5c98665479fb2988513627653072) Thanks [@fedorello](https://github.com/fedorello)! - `openapiTS()` with a `Readable` stream that fails now rejects with `SCHEMA_LOAD_FAILED`. Before,
  the promise never settled.

- [`04c5dac`](https://github.com/openapi-typesafe/openapi-typesafe/commit/04c5dac6ad3201f5c938f2979c065ef8b044ceea) Thanks [@fedorello](https://github.com/fedorello)! - A YAML or JSON file that does not parse (a tab indent, a second YAML document, broken JSON) now
  fails with `SCHEMA_PARSE_FAILED`, as text input does, instead of `SCHEMA_LOAD_FAILED`, and the
  message names the file. The exit code stays `3`.

- [#3](https://github.com/openapi-typesafe/openapi-typesafe/pull/3) [`186774b`](https://github.com/openapi-typesafe/openapi-typesafe/commit/186774bc97ffe258da1adfcb58ab41dbab886666) Thanks [@fedorello](https://github.com/fedorello)! - A `file:` URL source that names no path on the platform (an encoded slash, a host on POSIX, no
  drive letter on Windows) fails with `SCHEMA_LOAD_FAILED` and the URL in `details.source`, as a
  missing file does. Before, it failed with Node's untyped `TypeError`.

- [`e49344a`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e49344a208fb3bb38cd86f62c1395f8f7ca950f6) Thanks [@fedorello](https://github.com/fedorello)! - Packages contain only their build output, sources for source maps, the CLI, and the README, license and changelog. Coverage reports, local logs and tool configs are no longer packed.

- [`98e6188`](https://github.com/openapi-typesafe/openapi-typesafe/commit/98e618873aa53fd2431f353360a882835c8cb9e3) Thanks [@fedorello](https://github.com/fedorello)! - `--help` now lists `--generate-path-params`, which the CLI already accepted.

- [`3e690a3`](https://github.com/openapi-typesafe/openapi-typesafe/commit/3e690a3952aee7f85c89635007abefe68117edd8) Thanks [@fedorello](https://github.com/fedorello)! - `--root-types` names no longer keep letters that the running Node.js knows and TypeScript's scanner
  does not (Unicode 16 and 17 letters such as `꟒`): they become `_`, so the generated file parses.
  Before, such a schema name gave "Invalid character" errors. See ADR-019.

- [`0415208`](https://github.com/openapi-typesafe/openapi-typesafe/commit/0415208a644c505c008e6db9aafb9a7d1aad65b0) Thanks [@fedorello](https://github.com/fedorello)! - The error for the removed `-it` alias now names `--immutable`. It named `--immutable-types`, which is removed too.

- [`365452e`](https://github.com/openapi-typesafe/openapi-typesafe/commit/365452ec70175d0de1866a31c9140bf12ad6bf4e) Thanks [@fedorello](https://github.com/fedorello)! - With `--local-ref-root` reached through a symbolic link (macOS `/tmp` is one), a `$ref` to a
  missing file inside the root was refused with `SCHEMA_REF_FORBIDDEN` as if it were outside.
  It is now reported as an unresolved `$ref`, like any missing file.

- [`f55fb72`](https://github.com/openapi-typesafe/openapi-typesafe/commit/f55fb72f93ef4fe009278bcc1f62e5d16e4012e5) Thanks [@remy90](https://github.com/remy90)! - Support `additionalProperties: true` on string enums by generating a loose autocomplete union (`(enum literals) | (string & {})`), preserving editor suggestions while still accepting arbitrary string values.

- [`307f7df`](https://github.com/openapi-typesafe/openapi-typesafe/commit/307f7dfb7752d7c2406ebbfd33863f940b70468d) Thanks [@fedorello](https://github.com/fedorello)! - Fix a crash when a schema's `summary` or `title` is not a string, as when a property named `summary` is written without `properties:`. Such values no longer go into the JSDoc. Fixes upstream [#2349](https://github.com/openapi-typesafe/openapi-typesafe/issues/2349).

- [`35992ed`](https://github.com/openapi-typesafe/openapi-typesafe/commit/35992ed156502393f9b87dbc7541eeb68cb1a4ea) Thanks [@fedorello](https://github.com/fedorello)! - `--path-params-as-types`: when a template key such as `` `/apps/${string}` `` also matches another
  path (`/apps/regions`, `` `/apps/${string}/restart` ``) whose type does not fit the template's (a
  method or a parameter location one has and the other has not), the output did not compile
  (TS2411, TS2413). `paths` is then an intersection type alias with each such template in an object
  of its own, which removes those errors, and every path keeps the type it had. Output that
  compiled stays the same, `export interface paths` included.

- [`26f08b7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/26f08b74203dba7f4934978cc7a9badeb9333c15) Thanks [@fedorello](https://github.com/fedorello)! - `openapiTS("./openapi.yaml")` now fails with `SCHEMA_SOURCE_INVALID` and says to pass
  `pathToFileURL(path)`. A string source is document text, so a file path was parsed as YAML and
  failed with the unclear "Unsupported schema format, expected `openapi: 3.x`".

- [`35d9092`](https://github.com/openapi-typesafe/openapi-typesafe/commit/35d9092f55b791354f77b150dab13a6f7a71ea36) Thanks [@fedorello](https://github.com/fedorello)! - `--make-paths-enum` no longer writes an `ApiPaths` enum that does not compile. Names built from
  the URL that collided (`GetUser` for both `/user` and `/user/{user_id}`) now name the path
  parameters (`GetUserByUserId`), and a name that still repeats, such as a repeated `operationId`,
  gets a number (`listItems2`). Names that did not collide are unchanged.

- [`6882bd5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/6882bd5c6f040f624378527f493e1b687cb7bdb1) Thanks [@fedorello](https://github.com/fedorello)! - Fix names that contain `%` (for example a property `50%`): the generator escapes `%` as `%25` in the `$ref` pointers it builds, so reading them back no longer throws `URIError`, and a name like `a%2Fb` no longer reads back as `a/b`. The exported `createRef` escapes the same way. Fixes upstream [#2251](https://github.com/openapi-typesafe/openapi-typesafe/issues/2251), [#2828](https://github.com/openapi-typesafe/openapi-typesafe/issues/2828).

- [`63275f8`](https://github.com/openapi-typesafe/openapi-typesafe/commit/63275f86ff7ba855338f09f87fb9567c8ed91300) Thanks [@fedorello](https://github.com/fedorello)! - `Readable` and `Writable` keep function types as they are. Before, they mapped a `Blob` or a `Date`
  in response data into an object whose methods could not be called, so `data.file.arrayBuffer()`
  did not type check. The helper types that `--read-write-markers` writes into the output change the
  same way. See ADR-014, decision 6.

- [`d5dcbb3`](https://github.com/openapi-typesafe/openapi-typesafe/commit/d5dcbb3f38e4d583334977c50db92461085d4a11) Thanks [@fedorello](https://github.com/fedorello)! - `Readable` and `Writable` keep the shape of types without markers: readonly arrays stay arrays, tuples stay tuples, branded primitives (`string & { __brand }`) stay as they are, `allOf` arrays keep the properties of every member (so unions narrow again), and an optional `null` property is no longer dropped from request bodies. The `--read-write-markers` output carries the same fixed helpers (ADR-014). Fixes upstream [#2615](https://github.com/openapi-typesafe/openapi-typesafe/issues/2615), [#2620](https://github.com/openapi-typesafe/openapi-typesafe/issues/2620), [#2632](https://github.com/openapi-typesafe/openapi-typesafe/issues/2632), [#2717](https://github.com/openapi-typesafe/openapi-typesafe/issues/2717), [#2765](https://github.com/openapi-typesafe/openapi-typesafe/issues/2765).

- [`df1abc5`](https://github.com/openapi-typesafe/openapi-typesafe/commit/df1abc5a4d86d096983fc07237ff55cd69b34a06) Thanks [@fedorello](https://github.com/fedorello)! - Require `@redocly/openapi-core` `^1.34.22`. The old range allowed 1.34.6 to 1.34.14, which reject
  OpenAPI 3.2 documents, so an install that resolved one of them failed on 3.2 input.

- [`cbf804a`](https://github.com/openapi-typesafe/openapi-typesafe/commit/cbf804aafefc7ffe5374eaa68f52e269b9652fe5) Thanks [@fedorello](https://github.com/fedorello)! - The 60-second limit on a remote document or `$ref` now covers the body too. A server that sent
  the body slowly kept the run waiting, and a root URL then failed with "Cannot set property message
  of ... which has only a getter" instead of "Timed out after 60000 ms loading <url>".

- [`4638165`](https://github.com/openapi-typesafe/openapi-typesafe/commit/4638165e140ce4d097e4c20581e4e893a5ec873e) Thanks [@fedorello](https://github.com/fedorello)! - `--remote-ref-hosts` (`remoteRefHosts`) now matches hosts as URLs write them. A listed default
  port (`api.example.com:443`), a bare IPv6 address (`::1`), a trailing dot, a Unicode host name or
  another IPv4 form now match the URLs they name; before, such `$ref`s were refused. Entries that
  are not a host (with `/`, `@` or `#`) never match.

- [`cb058cd`](https://github.com/openapi-typesafe/openapi-typesafe/commit/cb058cdbf852b7549de553000d4bb36e390acc60) Thanks [@fedorello](https://github.com/fedorello)! - `--root-types`: a root alias whose name a helper type of the file also declares (a schema named
  `WithRequired` with `--root-types-no-schema-prefix`) is renamed to `WithRequired_2`, as aliases that
  an enum takes already are. Before, both were declared under one name, which does not compile.

- [`70d5ef9`](https://github.com/openapi-typesafe/openapi-typesafe/commit/70d5ef93425423c6faad5c775629541aa4bce54c) Thanks [@fedorello](https://github.com/fedorello)! - `--enum` with `--root-types`: a root type alias no longer gets the same name as an enum. Before,
  both were exported under one name and the output did not compile. The alias now gets the next free
  suffix (`ClusterState_2`); the enum keeps its name. Fixes upstream [#2099](https://github.com/openapi-typesafe/openapi-typesafe/issues/2099), [#2341](https://github.com/openapi-typesafe/openapi-typesafe/issues/2341), [#2206](https://github.com/openapi-typesafe/openapi-typesafe/issues/2206).

- [`3d4cafd`](https://github.com/openapi-typesafe/openapi-typesafe/commit/3d4cafd70d1da8bc80d6f3e4e3b9204f4643f840) Thanks [@fedorello](https://github.com/fedorello)! - `--root-types --root-types-no-schema-prefix --root-types-keep-casing`: a schema whose name
  TypeScript reserves (`void`, `class`, `string`, …) keeps the prefix (`Schemavoid`), as a name that
  starts with a digit already does. Before, `export type void` did not compile.

- [`68a5741`](https://github.com/openapi-typesafe/openapi-typesafe/commit/68a574108b02082d5d91f0c9bcef8b282cd23ea7) Thanks [@fedorello](https://github.com/fedorello)! - `--root-types-no-schema-prefix` with schemas of one PascalCase name (`Void` and `void`) gives the
  same output as openapi-typescript again: the last schema gets `Void` and the earlier ones have no
  root alias. `1.0.0-beta.2` also added numbered aliases (`Void_2`), which changed valid output;
  that is now a backlog item for an opt-in flag.

- [`afcaca4`](https://github.com/openapi-typesafe/openapi-typesafe/commit/afcaca4c97c718017c2b46a80e5a2084246465f8) Thanks [@fedorello](https://github.com/fedorello)! - `--check` names the stale file: `Generated types are not up-to-date! src/api.ts differs from its
schema.` With several APIs in `redocly.yaml`, this tells which output to regenerate.

- [`8a4c592`](https://github.com/openapi-typesafe/openapi-typesafe/commit/8a4c59221d4ed99fcf11c51ad0d14dbac2ad057f) Thanks [@fedorello](https://github.com/fedorello)! - The public `StringSubtype` type has `minLength`, `maxLength` and `pattern`, so callbacks can read
  them after narrowing a Schema Object to `type: "string"`.

- [`1081515`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1081515c69d6346dd9d7fc408e0a8a6082d6ed2f) Thanks [@fedorello](https://github.com/fedorello)! - Always generate names that parse. An `--enum` or `--enum-values` name that starts with a digit
  after invalid characters are removed now gets the `Value` prefix (`0 a-b` gave `value0 a-b`).
  With `--root-types-keep-casing`, characters that cannot be in an identifier become `_`
  (`Schemamy pet` is now `Schemamy_pet`). With `--root-types-no-schema-prefix`, a name that would
  start with a digit keeps its prefix (`Schema1`). Names that were valid before do not change.

- [`e271999`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e2719997bdfb326d28849a6162892dfdff21a468) Thanks [@fedorello](https://github.com/fedorello)! - Warn about OpenAPI 3.2 features that the generated types leave out: the `query` operation,
  `additionalOperations`, `in: querystring` parameters and `itemSchema`. Each use prints its JSON
  Pointer. Before, they were dropped without a word. See "OpenAPI 3.2 features" in the docs.

- [`77d7d5c`](https://github.com/openapi-typesafe/openapi-typesafe/commit/77d7d5cf867d21a3424d14bda60aec62d7e5ea96) Thanks [@fedorello](https://github.com/fedorello)! - A YAML document whose aliases (`*name`) expand it far beyond its written size (a "billion laughs"
  document) now fails at once with `SCHEMA_PARSE_FAILED`. Before, the run took minutes and ended
  with "RangeError: Set maximum size exceeded". Real documents that reuse anchors are not affected:
  the limit starts at 1,000,000 expanded nodes and 100 times the written size.

## 7.13.0

### Minor Changes

- [#2549](https://github.com/openapi-ts/openapi-typescript/pull/2549) [`a690e52`](https://github.com/openapi-ts/openapi-typescript/commit/a690e526b7693479bc2f2f002d71a020fa5e4e16) Thanks [@abumalick](https://github.com/abumalick)! - Add readOnly/writeOnly support via `--read-write-markers` flag. When enabled, readOnly properties are wrapped with `$Read<T>` and writeOnly properties with `$Write<T>`. openapi-fetch uses `Readable<T>` and `Writable<T>` helpers to exclude these properties from responses and request bodies respectively.

## 7.12.0

### Minor Changes

- [#2524](https://github.com/openapi-ts/openapi-typescript/pull/2524) [`697f7fe`](https://github.com/openapi-ts/openapi-typescript/commit/697f7fe8bf3f23bfa36cb29c093a359b562a377e) Thanks [@gunnarvelle](https://github.com/gunnarvelle)! - Added flag to keep casing for exported root types

### Patch Changes

- [#2536](https://github.com/openapi-ts/openapi-typescript/pull/2536) [`e3c05a4`](https://github.com/openapi-ts/openapi-typescript/commit/e3c05a40752b02fcabe63fda88d7e0afae00ab6d) Thanks [@darkbasic](https://github.com/darkbasic)! - Fix `enumValues: true` output for schemas that use `oneOf`/`anyOf` unions by narrowing union types with `Extract<>` before accessing variant-specific properties. This prevents invalid type paths when an accessed property only exists on some union members.

## 7.11.0

### Minor Changes

- [#2433](https://github.com/openapi-ts/openapi-typescript/pull/2433) [`27c9370`](https://github.com/openapi-ts/openapi-typescript/commit/27c9370911b50a981d146fa5c561b90d66dd2c0d) Thanks [@danitt](https://github.com/danitt)! - Conditionally generate TS enums

## 7.10.2

### Patch Changes

- [#2139](https://github.com/openapi-ts/openapi-typescript/pull/2139) [`12f9c29`](https://github.com/openapi-ts/openapi-typescript/commit/12f9c29b7653db3ab5d6beb4ac698ce5b58177aa) Thanks [@darkbasic](https://github.com/darkbasic)! - All kinds of enum related fixes (enums in arrays, in optional props, in unions, in request body, with record types...)

- [#2548](https://github.com/openapi-ts/openapi-typescript/pull/2548) [`4385590`](https://github.com/openapi-ts/openapi-typescript/commit/438559038baa931144768f186e8825f9e84cdb85) Thanks [@mynnx](https://github.com/mynnx)! - Fixes the `--redocly` flag so that it no longer hangs and is able to lookup the Redocly file at a custom path

## 7.10.1

### Patch Changes

- [#2480](https://github.com/openapi-ts/openapi-typescript/pull/2480) [`e04dc65`](https://github.com/openapi-ts/openapi-typescript/commit/e04dc65817a91eb7ceaea1992f0e674e5d885bb2) Thanks [@MatissJanis](https://github.com/MatissJanis)! - Fix multi-line jsdoc comments

## 7.10.0

### Minor Changes

- [#2449](https://github.com/openapi-ts/openapi-typescript/pull/2449) [`bdd5ddb`](https://github.com/openapi-ts/openapi-typescript/commit/bdd5ddb7d5f8463bd0515f0b2d5c98a8a394dabf) Thanks [@kristianjf](https://github.com/kristianjf)! - Add transformProperty hook for property signature modification

- [#2288](https://github.com/openapi-ts/openapi-typescript/pull/2288) [`0f22be2`](https://github.com/openapi-ts/openapi-typescript/commit/0f22be218f0c8050a96f35a6a271b959b2c5a23f) Thanks [@hontas](https://github.com/hontas)! - Add support for patternProperties

## 7.9.1

### Patch Changes

- [#2393](https://github.com/openapi-ts/openapi-typescript/pull/2393) [`6943ccf`](https://github.com/openapi-ts/openapi-typescript/commit/6943ccf216f602f004eb178dd652ffcbafc05346) Thanks [@simon-curtis](https://github.com/simon-curtis)! - Now checking for null & empty string when generating enum description

- [#2375](https://github.com/openapi-ts/openapi-typescript/pull/2375) [`5be22d7`](https://github.com/openapi-ts/openapi-typescript/commit/5be22d7adc8bc36fdfa91f1aa3473919107060f2) Thanks [@ParkerVR](https://github.com/ParkerVR)! - Fix behavior when using enum and export-type flags

## 7.9.0

### Minor Changes

- [#2374](https://github.com/openapi-ts/openapi-typescript/pull/2374) [`c5ebbb8`](https://github.com/openapi-ts/openapi-typescript/commit/c5ebbb8d5a0945c2360a2a147a3256d7e8585020) Thanks [@cmlee-accelins](https://github.com/cmlee-accelins)! - Add JSDoc support for the recommended examples array on JSON Schema objects.

## 7.8.0

### Minor Changes

- [#2310](https://github.com/openapi-ts/openapi-typescript/pull/2310) [`e66b5ce`](https://github.com/openapi-ts/openapi-typescript/commit/e66b5ce63bfcdc57c6ee942e5ed4e7667e64c290) Thanks [@drwpow](https://github.com/drwpow)! - Build package with unbuild to improve CJS support

## 7.7.3

### Patch Changes

- [#2185](https://github.com/openapi-ts/openapi-typescript/pull/2185) [`67889ba`](https://github.com/openapi-ts/openapi-typescript/commit/67889baf7832188f6589e0fb2e3d31a2e6ede257) Thanks [@duncanbeevers](https://github.com/duncanbeevers)! - Fix invalid $ref index into path

## 7.7.2

### Patch Changes

- [#2145](https://github.com/openapi-ts/openapi-typescript/pull/2145) [`d79efae`](https://github.com/openapi-ts/openapi-typescript/commit/d79efaea3385d2421d3d295f69d7036cddb106b5) Thanks [@luhn](https://github.com/luhn)! - Don't remove `null` type if a default is present.

## 7.7.1

### Patch Changes

- [#2260](https://github.com/openapi-ts/openapi-typescript/pull/2260) [`7205e12`](https://github.com/openapi-ts/openapi-typescript/commit/7205e12e07e5fd36a6bb3be44ea911f57bbbeb60) Thanks [@zrosenbauer](https://github.com/zrosenbauer)! - Prevents a `TypeError` due to a bad in operator for `type: "array"` when a `boolean` is set on `items`

## 7.7.0

### Minor Changes

- [#2249](https://github.com/openapi-ts/openapi-typescript/pull/2249) [`7f3f7b6`](https://github.com/openapi-ts/openapi-typescript/commit/7f3f7b65da5ef8caf5304486184118352665eb3f) Thanks [@gzm0](https://github.com/gzm0)! - Add jsdoc comments to response object

### Patch Changes

- [#2199](https://github.com/openapi-ts/openapi-typescript/pull/2199) [`fc3f7f8`](https://github.com/openapi-ts/openapi-typescript/commit/fc3f7f8b9cf52f0d4daf31ed4579d588c5b0f3e6) Thanks [@StefanTerdell](https://github.com/StefanTerdell)! - Fix boolean object property schemas

- [#2152](https://github.com/openapi-ts/openapi-typescript/pull/2152) [`47e4b5e`](https://github.com/openapi-ts/openapi-typescript/commit/47e4b5eb86adc59e3de2a4179741d35a26db61c0) Thanks [@insertmike](https://github.com/insertmike)! - - Fixed --make-paths-enum option transforming the paths URL (`:id` instead of `{id}`)

- [#2241](https://github.com/openapi-ts/openapi-typescript/pull/2241) [`ef23947`](https://github.com/openapi-ts/openapi-typescript/commit/ef239479b5f15fc4c98dd15c72974d4cb8722fb0) Thanks [@stanleyk](https://github.com/stanleyk)! - Replacing `any` with `unknown` in the `ReadonlyArray` type declaration.

## 7.6.1

### Patch Changes

- [#2131](https://github.com/openapi-ts/openapi-typescript/pull/2131) [`41bed98`](https://github.com/openapi-ts/openapi-typescript/commit/41bed98f2ff6b41f4f4759724af2d9582f8c4449) Thanks [@htunnicliff](https://github.com/htunnicliff)! - Update @redocly/openapi-core to fix punycode deprecation bug

## 7.6.0

### Minor Changes

- [#2102](https://github.com/openapi-ts/openapi-typescript/pull/2102) [`0cdfc47`](https://github.com/openapi-ts/openapi-typescript/commit/0cdfc479b981c26ead188f8883b856c0c8e3c841) Thanks [@ViktorPontinen](https://github.com/ViktorPontinen)! - Support generating path params for flaky schemas using --generate-path-params option

## 7.5.2

### Patch Changes

- [#2085](https://github.com/openapi-ts/openapi-typescript/pull/2085) [`2bffe2a`](https://github.com/openapi-ts/openapi-typescript/commit/2bffe2a652864a54c8dc969327e4a8eb4081eb25) Thanks [@drwpow](https://github.com/drwpow)! - Update @redocly/openapi-core to 1.27.0

## 7.5.1

### Patch Changes

- [#2049](https://github.com/openapi-ts/openapi-typescript/pull/2049) [`39f9b2f`](https://github.com/openapi-ts/openapi-typescript/commit/39f9b2fb913eb13817592b22f1bbe35de1bc4c33) Thanks [@duncanbeevers](https://github.com/duncanbeevers)! - Add schema to postTransform options

## 7.5.0

### Minor Changes

- [#2052](https://github.com/openapi-ts/openapi-typescript/pull/2052) [`d2de5c7`](https://github.com/openapi-ts/openapi-typescript/commit/d2de5c7e596d1b427d6d5d629974627456623305) Thanks [@laurenz-glueck](https://github.com/laurenz-glueck)! - brings back --make-paths-enum option to generate ApiPaths enum

- [#2059](https://github.com/openapi-ts/openapi-typescript/pull/2059) [`9e4f61c`](https://github.com/openapi-ts/openapi-typescript/commit/9e4f61c530fe634051fa5c9b25e18a5f9ff1f76f) Thanks [@gduliscouet-ubitransport](https://github.com/gduliscouet-ubitransport)! - Allow all types except UNKNOWN to be nullable

## 7.4.4

### Patch Changes

- [#1999](https://github.com/openapi-ts/openapi-typescript/pull/1999) [`e2d8541`](https://github.com/openapi-ts/openapi-typescript/commit/e2d854131a1dc11d3b8e8513d3e0ce1f04ea1211) Thanks [@patzick](https://github.com/patzick)! - Improved error messages to contain locations.

## 7.4.3

### Patch Changes

- [#1982](https://github.com/openapi-ts/openapi-typescript/pull/1982) [`8d00218`](https://github.com/openapi-ts/openapi-typescript/commit/8d00218aaaa65bd175a2538f60cb508a1219a415) Thanks [@prewk](https://github.com/prewk)! - Make pathParamsAsTypes work with integer/boolean types

## 7.4.2

### Patch Changes

- [#1873](https://github.com/openapi-ts/openapi-typescript/pull/1873) [`c2c396d`](https://github.com/openapi-ts/openapi-typescript/commit/c2c396d8282692f3ac2df50656ebcd9e8615a685) Thanks [@DanDeMicco](https://github.com/DanDeMicco)! - Support for generating enums when enums definition has null value

## 7.4.1

### Patch Changes

- [#1917](https://github.com/openapi-ts/openapi-typescript/pull/1917) [`4a59124`](https://github.com/openapi-ts/openapi-typescript/commit/4a591248175f918369a9713dea0856b12dca16c3) Thanks [@drwpow](https://github.com/drwpow)! - Bump Redocly Core

## 7.4.0

### Minor Changes

- [#1876](https://github.com/openapi-ts/openapi-typescript/pull/1876) [`a9cd9aa`](https://github.com/openapi-ts/openapi-typescript/commit/a9cd9aa56dd9dec043a4e4fd85527acac227a142) Thanks [@BradHacker](https://github.com/BradHacker)! - Add option to export all root component types

## 7.3.3

### Patch Changes

- [#1877](https://github.com/openapi-ts/openapi-typescript/pull/1877) [`94592a4`](https://github.com/openapi-ts/openapi-typescript/commit/94592a494566255807a3fc9bc19369af86d7cb78) Thanks [@phk422](https://github.com/phk422)! - fix: replace special characters using `SPECIAL_CHARACTER_MAP` for duplicate-identifiers

## 7.3.2

### Patch Changes

- [#1867](https://github.com/openapi-ts/openapi-typescript/pull/1867) [`21fb8b0`](https://github.com/openapi-ts/openapi-typescript/commit/21fb8b0febbae1a12dd1bb43eb9130422629409e) Thanks [@phk422](https://github.com/phk422)! - fix(openapi-typescript): type errors generated under `enumValues`

## 7.3.1

### Patch Changes

- [#1849](https://github.com/openapi-ts/openapi-typescript/pull/1849) [`08bde72`](https://github.com/openapi-ts/openapi-typescript/commit/08bde72cfeed14ecc3a15251a2f77d0770382442) Thanks [@liangskyli](https://github.com/liangskyli)! - fix: keyedParameters use unique key

## 7.3.0

### Minor Changes

- [#1799](https://github.com/openapi-ts/openapi-typescript/pull/1799) [`9939b76`](https://github.com/openapi-ts/openapi-typescript/commit/9939b76f29b90baa868b8764a403dcb98fc2ca65) Thanks [@drwpow](https://github.com/drwpow)! - Don’t generate `| undefined` for additionalProperties

## 7.2.0

### Minor Changes

- [#1775](https://github.com/openapi-ts/openapi-typescript/pull/1775) [`b1bbe62`](https://github.com/openapi-ts/openapi-typescript/commit/b1bbe6295fad3a798fe3d8c5c9c1347ae17e268f) Thanks [@phk422](https://github.com/phk422)! - feat: add dedupeEnums option

## 7.1.2

### Patch Changes

- [#1717](https://github.com/openapi-ts/openapi-typescript/pull/1717) [`335530c`](https://github.com/openapi-ts/openapi-typescript/commit/335530c4f8f966d0154f19504585c462f5f5a409) Thanks [@kerwanp](https://github.com/kerwanp)! - Ignore configuration files in published package

## 7.1.1

### Patch Changes

- [#1784](https://github.com/openapi-ts/openapi-typescript/pull/1784) [`c2f8655`](https://github.com/openapi-ts/openapi-typescript/commit/c2f8655c0be5f8131d0ef115724fa4a443c44a8b) Thanks [@yoshi2no](https://github.com/yoshi2no)! - Fix: Correct handling of identical minItems and maxItems in array schemas when arrayLength option is true

## 7.1.0

### Minor Changes

- [#1766](https://github.com/openapi-ts/openapi-typescript/pull/1766) [`0ce35d7`](https://github.com/openapi-ts/openapi-typescript/commit/0ce35d7ca707b4bd8e2d794c002dcd158079864e) Thanks [@phk422](https://github.com/phk422)! - feat: Add the inject option

- [#1768](https://github.com/openapi-ts/openapi-typescript/pull/1768) [`285b097`](https://github.com/openapi-ts/openapi-typescript/commit/285b0970a6d32406bb67677860e2dcbb3d7ad993) Thanks [@phk422](https://github.com/phk422)! - feat: Add check option

### Patch Changes

- [#1772](https://github.com/openapi-ts/openapi-typescript/pull/1772) [`41cb9a2`](https://github.com/openapi-ts/openapi-typescript/commit/41cb9a232127e5ae421b1853506b75f718683c3d) Thanks [@ashwin153](https://github.com/ashwin153)! - fix: add explicit import of performance to fix bazel compatibility issues

- [#1764](https://github.com/openapi-ts/openapi-typescript/pull/1764) [`2793049`](https://github.com/openapi-ts/openapi-typescript/commit/2793049b1102d9e3ae6ec0f933794993a228c745) Thanks [@michalfedyna](https://github.com/michalfedyna)! - Fix --properties-required-by-default flag not working

- [#1763](https://github.com/openapi-ts/openapi-typescript/pull/1763) [`19b9383`](https://github.com/openapi-ts/openapi-typescript/commit/19b9383de63b6aa6a9c71cdd8741a0de6f206a55) Thanks [@nkt](https://github.com/nkt)! - fix: schema.content might be omitted

## 7.0.4

### Patch Changes

- [#1746](https://github.com/openapi-ts/openapi-typescript/pull/1746) [`e705909`](https://github.com/openapi-ts/openapi-typescript/commit/e705909f2b15d8b207be4be22f329e29e5f6444b) Thanks [@phk422](https://github.com/phk422)! - fix: Correct handling of default parameter values in referenced component schema

## 7.0.3

### Patch Changes

- [#1761](https://github.com/openapi-ts/openapi-typescript/pull/1761) [`8043c5d`](https://github.com/openapi-ts/openapi-typescript/commit/8043c5d27d3abf9df1a3e9cf031531a52921a122) Thanks [@yoshi2no](https://github.com/yoshi2no)! - fix: Enum option cannot generate enums if values are not valid property names

## 7.0.2

### Patch Changes

- [#1743](https://github.com/openapi-ts/openapi-typescript/pull/1743) [`8f6ec20`](https://github.com/openapi-ts/openapi-typescript/commit/8f6ec20d5d26396c1745690f0e42675776e1a691) Thanks [@avaly](https://github.com/avaly)! - Generate valid types for referenced nested properties

## 7.0.1

### Patch Changes

- [#1724](https://github.com/openapi-ts/openapi-typescript/pull/1724) [`f47268f`](https://github.com/openapi-ts/openapi-typescript/commit/f47268f38b542b0adf61861efe3fdbf63d0a37f1) Thanks [@simensol](https://github.com/simensol)! - Make sure result is an object before using the in operator.

## 7.0.0

### Major Changes

- [`6d1eb32`](https://github.com/openapi-ts/openapi-typescript/commit/6d1eb32e610cb62effbd1a817ae8fc93337126a6) Thanks [@drwpow](https://github.com/drwpow)! - ⚠️ **Breaking**: The Node.js API now returns the TypeScript AST for the main method as well as `transform()` and `postTransform()`. To migrate, you’ll have to use the `typescript` compiler API:

  ```diff
  + import ts from "typescript";

  + const DATE = ts.factory.createIdentifier("Date");
  + const NULL = ts.factory.createLiteralTypeNode(ts.factory.createNull());

    const ast = await openapiTS(mySchema, {
      transform(schemaObject, metadata) {
        if (schemaObject.format === "date-time") {
  -       return schemaObject.nullable ? "Date | null" : "Date";
  +       return schemaObject.nullable
  +         ? ts.factory.createUnionTypeNode([DATE, NULL])
  +         : DATE;
        }
      },
    };
  ```

  Though it’s more verbose, it’s also more powerful, as now you have access to additional properties of the generated code you didn’t before (such as injecting comments).

  For example syntax, search this codebae to see how the TypeScript AST is used.

  Also see [AST Explorer](https://astexplorer.net/)’s `typescript` parser to inspect how TypeScript is interpreted as an AST.

- [`6d1eb32`](https://github.com/openapi-ts/openapi-typescript/commit/6d1eb32e610cb62effbd1a817ae8fc93337126a6) Thanks [@drwpow](https://github.com/drwpow)! - ⚠️ **Breaking**: Changing of several CLI flags and Node.js API options
  - The `--auth`, `--httpHeaders`, `--httpMethod`, and `fetch` (Node.js-only) options were all removed from the CLI and Node.js API
    - To migrate, you’ll need to create a [redocly.yaml config](https://redocly.com/docs/cli/configuration/) that specifies your auth options [in the http setting](https://redocly.com/docs/cli/configuration/#resolve-non-public-or-non-remote-urls)
    - You can also set your fetch client in redocly.yaml as well.
  - `--immutable-types` has been renamed to `--immutable`
  - `--support-array-length` has been renamed to `--array-length`

- [`fbaf96d`](https://github.com/openapi-ts/openapi-typescript/commit/fbaf96d33181a2fabd3d4748e54c0f111ed6756e) Thanks [@drwpow](https://github.com/drwpow)! - ⚠️ **Breaking**: Remove globbing schemas in favor of `redocly.yaml` config. Specify multiple schemas with outputs in there instead. See [Multiple schemas](https://openapi-ts.dev/docs/cli/#multiple-schemas) for more info.

- [`6d1eb32`](https://github.com/openapi-ts/openapi-typescript/commit/6d1eb32e610cb62effbd1a817ae8fc93337126a6) Thanks [@drwpow](https://github.com/drwpow)! - ⚠️ **Breaking**: Most optional objects are now always present in types, just typed as `:never`. This includes keys of the Components Object as well as HTTP methods.

- [`6d1eb32`](https://github.com/openapi-ts/openapi-typescript/commit/6d1eb32e610cb62effbd1a817ae8fc93337126a6) Thanks [@drwpow](https://github.com/drwpow)! - ⚠️ **Breaking**: No more `external` export in schemas anymore. Everything gets flattened into the `components` object instead (if referencing a schema object from a remote partial, note it may have had a minor name change to avoid conflict).

- [`6d1eb32`](https://github.com/openapi-ts/openapi-typescript/commit/6d1eb32e610cb62effbd1a817ae8fc93337126a6) Thanks [@drwpow](https://github.com/drwpow)! - ⚠️ **Breaking** `defaultNonNullable` option now defaults to `true`. You’ll now need to manually set `false` to return to old behavior.

- [`799194d `](https://github.com/openapi-ts/openapi-typescript/commit/799194d98c3934570c6500d986496eee17b79309) Thanks [@drwpow](https://github.com/drwpow)~ - ⚠️ **Breaking** TypeScript is now a peerDependency and must be installed alongside `openapi-typescript`

### Minor Changes

- [`6d1eb32`](https://github.com/openapi-ts/openapi-typescript/commit/6d1eb32e610cb62effbd1a817ae8fc93337126a6) Thanks [@drwpow](https://github.com/drwpow)! - ✨ **Feature**: automatically validate schemas with Redocly CLI ([docs](https://redocly.com/docs/cli/)). No more need for external tools to report errors! 🎉
  - By default, it will only throw on actual schema errors (uses Redocly’s default settings)
  - For stricter linting or custom rules, you can create a [redocly.yaml config](https://redocly.com/docs/cli/configuration/)

- [`312b7ba`](https://github.com/openapi-ts/openapi-typescript/commit/312b7ba03fc0334153d4eeb51d6159f3fc63934e) Thanks [@drwpow](https://github.com/drwpow)! - ✨ **Feature:** allow configuration of schemas via `apis` key in redocly.config.yaml. [See docs](https://openapi-ts.dev/cli/) for more info.
  - Any options passed into your [redocly.yaml config](https://redocly.com/docs/cli/configuration/) are respected

- [`6d1eb32`](https://github.com/openapi-ts/openapi-typescript/commit/6d1eb32e610cb62effbd1a817ae8fc93337126a6) Thanks [@drwpow](https://github.com/drwpow)! - ✨ **Feature**: add `enum` option to export top-level enums from schemas

- [`6d1eb32`](https://github.com/openapi-ts/openapi-typescript/commit/6d1eb32e610cb62effbd1a817ae8fc93337126a6) Thanks [@drwpow](https://github.com/drwpow)! - ✨ **Feature**: add `formatOptions` to allow formatting TS output

- [`6d1eb32`](https://github.com/openapi-ts/openapi-typescript/commit/6d1eb32e610cb62effbd1a817ae8fc93337126a6) Thanks [@drwpow](https://github.com/drwpow)! - ✨ **Feature**: header responses add `[key: string]: unknown` index type to allow for additional untyped headers

- [`6d1eb32`](https://github.com/openapi-ts/openapi-typescript/commit/6d1eb32e610cb62effbd1a817ae8fc93337126a6) Thanks [@drwpow](https://github.com/drwpow)! - ✨ **Feature**: bundle schemas with Redocly CLI

- [`6d1eb32`](https://github.com/openapi-ts/openapi-typescript/commit/6d1eb32e610cb62effbd1a817ae8fc93337126a6) Thanks [@drwpow](https://github.com/drwpow)! - ✨ **Feature**: Added debugger that lets you profile performance and see more in-depth messages

- [#1374](https://github.com/openapi-ts/openapi-typescript/pull/1374) [`7ac5174`](https://github.com/openapi-ts/openapi-typescript/commit/7ac5174a1f767c1103573543bb17622ac8d25fe4) Thanks [@ElForastero](https://github.com/ElForastero)! - Add support for x-enum-varnames and x-enum-descriptions

- [#1545](https://github.com/openapi-ts/openapi-typescript/pull/1545) [`9158b81`](https://github.com/openapi-ts/openapi-typescript/commit/9158b81e8fdd45491afde8e291a786d7b2abc154) Thanks [@jaredLunde](https://github.com/openapi-ts/openapi-typescript/commits?author=jaredLunde)! - Replace # characters in operation IDs with a slash

### Patch Changes

- [`6d1eb32`](https://github.com/openapi-ts/openapi-typescript/commit/6d1eb32e610cb62effbd1a817ae8fc93337126a6) Thanks [@drwpow](https://github.com/drwpow)! - Refactor internals to use TypeScript AST rather than string mashing

- [`6d1eb32`](https://github.com/openapi-ts/openapi-typescript/commit/6d1eb32e610cb62effbd1a817ae8fc93337126a6) Thanks [@drwpow](https://github.com/drwpow)! - 🧹 Cleaned up and reorganized all tests

- [#1602](https://github.com/openapi-ts/openapi-typescript/pull/1602) [`9da96cd`](https://github.com/openapi-ts/openapi-typescript/commit/9da96cda4eb8f959c4703637d8fc89e1d3532af1) Thanks [@JeanRemiDelteil](https://github.com/JeanRemiDelteil)! - Do not add readonly on Typescript enum when the --immutable option is used.

## 6.7.0

### Minor Changes

- [#1355](https://github.com/openapi-ts/openapi-typescript/pull/1355) [`7568941`](https://github.com/openapi-ts/openapi-typescript/commit/7568941fb378a9b94c96754553a720093645dd64) Thanks [@drwpow](https://github.com/drwpow)! - Revert optional parameters breaking change (v6.6.0, #1335)

## 6.6.2

### Patch Changes

- [#1348](https://github.com/openapi-ts/openapi-typescript/pull/1348) [`f6fdd2f`](https://github.com/openapi-ts/openapi-typescript/commit/f6fdd2f59d035fec22f7fee27136939faae4628b) Thanks [@drwpow](https://github.com/drwpow)! - Improve YAML vs JSON parsing

- [#1352](https://github.com/openapi-ts/openapi-typescript/pull/1352) [`33b2c4f`](https://github.com/openapi-ts/openapi-typescript/commit/33b2c4f6d9f8d2a1bd42b13b3c8c168ed86609d6) Thanks [@drwpow](https://github.com/drwpow)! - Fix all parameters optional

- [#1345](https://github.com/openapi-ts/openapi-typescript/pull/1345) [`6f078c1`](https://github.com/openapi-ts/openapi-typescript/commit/6f078c1eb008a278858e6764e92af6ceb39922b4) Thanks [@SchabaJo](https://github.com/SchabaJo)! - Mirror directory structure of input files if output is a directory to prevent overwriting the same file again and again.

## 6.6.1

### Patch Changes

- [#1342](https://github.com/openapi-ts/openapi-typescript/pull/1342) [`c17669d`](https://github.com/openapi-ts/openapi-typescript/commit/c17669dbee47af49136bea3c40e12009e92cd81b) Thanks [@drwpow](https://github.com/drwpow)! - Fix discriminator propertyName inference

## 6.6.0

### Minor Changes

- [#1335](https://github.com/openapi-ts/openapi-typescript/pull/1335) [`7cb02ac`](https://github.com/openapi-ts/openapi-typescript/commit/7cb02acbcf57946b8202b9598a888454f09f81fa) Thanks [@duncanbeevers](https://github.com/duncanbeevers)! - Request parameters member is optional when all parameters are optional.

## 6.5.5

### Patch Changes

- [#1332](https://github.com/openapi-ts/openapi-typescript/pull/1332) [`8e8ebfd`](https://github.com/openapi-ts/openapi-typescript/commit/8e8ebfdcd84ff6a3d7b6f5d00695fc11366b436e) Thanks [@drwpow](https://github.com/drwpow)! - Restore original .d.ts module-resolution behavior

## 6.5.4

### Patch Changes

- [#1324](https://github.com/openapi-ts/openapi-typescript/pull/1324) [`0357325`](https://github.com/openapi-ts/openapi-typescript/commit/0357325ae136cbdd9c9891ebb7f5414e3ad8bfec) Thanks [@drwpow](https://github.com/drwpow)! - Fix accidental quote appearing in components/responses with $refs

## 6.5.3

### Patch Changes

- [#1320](https://github.com/openapi-ts/openapi-typescript/pull/1320) [`3cf78b9`](https://github.com/openapi-ts/openapi-typescript/commit/3cf78b920ab23624c0524e0d58338ee66acad799) Thanks [@duncanbeevers](https://github.com/duncanbeevers)! - Wrap nested readonly types in parentheses, allowing for nested immutable arrays

## 6.5.2

### Patch Changes

- [#1317](https://github.com/openapi-ts/openapi-typescript/pull/1317) [`5e054db`](https://github.com/openapi-ts/openapi-typescript/commit/5e054dbc0984198c7f89e29b6f38e9d60790cafb) Thanks [@drwpow](https://github.com/drwpow)! - Fix JSONSchema $defs

- [#1317](https://github.com/openapi-ts/openapi-typescript/pull/1317) [`5e054db`](https://github.com/openapi-ts/openapi-typescript/commit/5e054dbc0984198c7f89e29b6f38e9d60790cafb) Thanks [@drwpow](https://github.com/drwpow)! - Improve remote $ref parsing

## 6.5.1

### Patch Changes

- [#1308](https://github.com/openapi-ts/openapi-typescript/pull/1308) [`ebb73b6`](https://github.com/openapi-ts/openapi-typescript/commit/ebb73b68c3a2f9a8c8193888735f9c0b7855722f) Thanks [@drwpow](https://github.com/drwpow)! - Fix bugs with remote $refs, add `cwd` option for JSON schema parsing

## 6.5.0

### Minor Changes

- [#1295](https://github.com/openapi-ts/openapi-typescript/pull/1295) [`99a1648`](https://github.com/openapi-ts/openapi-typescript/commit/99a1648affd5731c2d303619f050fee2ed834eef) Thanks [@pvanagtmaal](https://github.com/pvanagtmaal)! - Avoid adding a undefined union to additionProperties

## 6.4.5

### Patch Changes

- [#1280](https://github.com/openapi-ts/openapi-typescript/pull/1280) [`50441d0`](https://github.com/openapi-ts/openapi-typescript/commit/50441d048b8724d1ec31d20a1583c8748b7ddc99) Thanks [@pvanagtmaal](https://github.com/pvanagtmaal)! - Fix invalid typescript for empty request bodies, fix headers being left out when response body is omitted

- [#1289](https://github.com/openapi-ts/openapi-typescript/pull/1289) [`7f452fa`](https://github.com/openapi-ts/openapi-typescript/commit/7f452fa00044c7191c2721b6691178158f97940f) Thanks [@adamschoenemann](https://github.com/adamschoenemann)! - Fixed a bug where references to types with discriminators with implicit mappings would generate incorrect types

## 6.4.4

### Patch Changes

- [#1281](https://github.com/openapi-ts/openapi-typescript/pull/1281) [`ebd31ff`](https://github.com/openapi-ts/openapi-typescript/commit/ebd31ff3d143dbe8e4d91a4ba18b110ff6656dd0) Thanks [@pvanagtmaal](https://github.com/pvanagtmaal)! - Refactor CLI path handling, fixing several bugs

## 6.4.3

### Patch Changes

- [#1287](https://github.com/openapi-ts/openapi-typescript/pull/1287) [`8a9d8ed`](https://github.com/openapi-ts/openapi-typescript/commit/8a9d8ede95802370c4015846a4856fd0701ada33) Thanks [@drwpow](https://github.com/drwpow)! - Fix oneOf handling with empty object parent type

## 6.4.2

### Patch Changes

- [#1278](https://github.com/openapi-ts/openapi-typescript/pull/1278) [`d7420e3`](https://github.com/openapi-ts/openapi-typescript/commit/d7420e30f1697ad8cfc0fdefc93127ad2b813f99) Thanks [@pvanagtmaal](https://github.com/pvanagtmaal)! - Fix externalizing external refs

## 6.4.1

### Patch Changes

- [#1269](https://github.com/openapi-ts/openapi-typescript/pull/1269) [`e735ff2`](https://github.com/openapi-ts/openapi-typescript/commit/e735ff2b9307eaec1959d0d3bf733a240a880c48) Thanks [@pimveldhuisen](https://github.com/pimveldhuisen)! - Stop trimming whitespace other than linebreaks in string values

## 6.4.0

### Minor Changes

- [#1263](https://github.com/openapi-ts/openapi-typescript/pull/1263) [`1bf2d4d`](https://github.com/openapi-ts/openapi-typescript/commit/1bf2d4db73b93fd1d36ffb56bdfb90321b0bfaba) Thanks [@drwpow](https://github.com/drwpow)! - Ship CJS bundle

## 6.3.9

### Patch Changes

- [#1248](https://github.com/openapi-ts/openapi-typescript/pull/1248) [`c145f5f`](https://github.com/openapi-ts/openapi-typescript/commit/c145f5f6164b52a8b437b2e944f60927d546edbf) Thanks [@drwpow](https://github.com/drwpow)! - Fix Record<string, never> appearing in union

- [#1248](https://github.com/openapi-ts/openapi-typescript/pull/1248) [`c145f5f`](https://github.com/openapi-ts/openapi-typescript/commit/c145f5f6164b52a8b437b2e944f60927d546edbf) Thanks [@drwpow](https://github.com/drwpow)! - Improve oneOf generated types

## 6.3.8

### Patch Changes

- [#1246](https://github.com/openapi-ts/openapi-typescript/pull/1246) [`17a375e`](https://github.com/openapi-ts/openapi-typescript/commit/17a375ec5d13b89f526a63f6d9b9f15db85b75e9) Thanks [@drwpow](https://github.com/drwpow)! - Fix remote path item object $refs

## 6.3.7

### Patch Changes

- [#1236](https://github.com/openapi-ts/openapi-typescript/pull/1236) [`95a4c8c`](https://github.com/openapi-ts/openapi-typescript/commit/95a4c8c573c8eea2c911359879419eb07e10bd63) Thanks [@drwpow](https://github.com/drwpow)! - Improve oneOf and enum handling

## 6.3.6

### Patch Changes

- [#1231](https://github.com/openapi-ts/openapi-typescript/pull/1231) [`e1ce2d6`](https://github.com/openapi-ts/openapi-typescript/commit/e1ce2d67a5350ff2871ae01503df2280454b7a80) Thanks [@tkrotoff](https://github.com/tkrotoff)! - Do not append trailing spaces to JSDoc tags

- [#1232](https://github.com/openapi-ts/openapi-typescript/pull/1232) [`31c030d`](https://github.com/openapi-ts/openapi-typescript/commit/31c030d5f1bf2739dbc146e42372cf9aec922f93) Thanks [@tkrotoff](https://github.com/tkrotoff)! - Remove unnecessary array parenthesis

## 6.3.5

### Patch Changes

- [#1228](https://github.com/openapi-ts/openapi-typescript/pull/1228) [`3107f1e`](https://github.com/openapi-ts/openapi-typescript/commit/3107f1edb9119397fca3e34aeda4def3555c0811) Thanks [@m-ronchi](https://github.com/m-ronchi)! - Fix boolean JSON Schemas

## 6.3.4

### Patch Changes

- [#1221](https://github.com/openapi-ts/openapi-typescript/pull/1221) [`4e96e9d`](https://github.com/openapi-ts/openapi-typescript/commit/4e96e9dcb845adc501d7256c3c3c9c30c8c6d99d) Thanks [@drwpow](https://github.com/drwpow)! - Remove OneOf<> helper for simple type comparisons

- [#1221](https://github.com/openapi-ts/openapi-typescript/pull/1221) [`4e96e9d`](https://github.com/openapi-ts/openapi-typescript/commit/4e96e9dcb845adc501d7256c3c3c9c30c8c6d99d) Thanks [@drwpow](https://github.com/drwpow)! - Fix 3.1 nullable types

## 6.3.3

### Patch Changes

- [#1200](https://github.com/openapi-ts/openapi-typescript/pull/1200) [`4fc8c20`](https://github.com/openapi-ts/openapi-typescript/commit/4fc8c20c079e81c600ecffffd90fc9c77c11d49e) Thanks [@toomuchdesign](https://github.com/toomuchdesign)! - Remove unexpected empty string in generated nullable polymophic enum types (["string", "null"])

## 6.3.2

### Patch Changes

- [#1212](https://github.com/openapi-ts/openapi-typescript/pull/1212) [`e173ccf`](https://github.com/openapi-ts/openapi-typescript/commit/e173ccf0d92fd4b54cb2dec54056f4647cbadc83) Thanks [@drwpow](https://github.com/drwpow)! - Fix bug with remote schema $refs

## 6.3.1

### Patch Changes

- [#1207](https://github.com/openapi-ts/openapi-typescript/pull/1207) [`914e049`](https://github.com/openapi-ts/openapi-typescript/commit/914e049573218b1bf791ce7855cdb1022bedc2b2) Thanks [@drwpow](https://github.com/drwpow)! - Fall back to TypeScript unions for long oneOf lists

## 6.3.0

### Minor Changes

- [#1205](https://github.com/openapi-ts/openapi-typescript/pull/1205) [`c753f7b`](https://github.com/openapi-ts/openapi-typescript/commit/c753f7b27a93bb963d8b762b8faa785025aa9135) Thanks [@drwpow](https://github.com/drwpow)! - Add prefixItems support

### Patch Changes

- [#1203](https://github.com/openapi-ts/openapi-typescript/pull/1203) [`902fde1`](https://github.com/openapi-ts/openapi-typescript/commit/902fde156a55f2f0f4889680cea3605cc9d137b4) Thanks [@drwpow](https://github.com/drwpow)! - Fix mutating $refs in Node.js API

## 6.2.9

### Patch Changes

- [#1193](https://github.com/openapi-ts/openapi-typescript/pull/1193) [`64decb7`](https://github.com/openapi-ts/openapi-typescript/commit/64decb7243e3f4962dd3a97378f37142ee89546a) Thanks [@psychedelicious](https://github.com/psychedelicious)! - Add example for `Blob` type transforms

## 6.2.8

### Patch Changes

- [#1166](https://github.com/openapi-ts/openapi-typescript/pull/1166) [`db37f3c`](https://github.com/openapi-ts/openapi-typescript/commit/db37f3ca2993a3d7e7cf580273452c21a68c503d) Thanks [@pvanagtmaal](https://github.com/pvanagtmaal)! - Fix property escaping for discriminators

## 6.2.7

### Patch Changes

- [#1149](https://github.com/openapi-ts/openapi-typescript/pull/1149) [`b82cffb`](https://github.com/openapi-ts/openapi-typescript/commit/b82cffbc6c3fc0da9a24d9b90b303dcb2dd71c62) Thanks [@duncanbeevers](https://github.com/duncanbeevers)! - Stringify const values with no specified type

- [#1156](https://github.com/openapi-ts/openapi-typescript/pull/1156) [`ad017a9`](https://github.com/openapi-ts/openapi-typescript/commit/ad017a9ac2dc5b01726267fca9418b311fe91896) Thanks [@horaklukas](https://github.com/horaklukas)! - Avoid index signature TS error for paths with empty params

## 6.2.6

### Patch Changes

- [#1146](https://github.com/openapi-ts/openapi-typescript/pull/1146) [`12aa721`](https://github.com/openapi-ts/openapi-typescript/commit/12aa7212fbe09efd0fe89dca18713145e8da9c8e) Thanks [@drwpow](https://github.com/drwpow)! - Fix js-yaml $refs

## 6.2.5

### Patch Changes

- 7d09c3b: Support nested path parameters in `--path-params-as-types` (#1130). Thanks, [barakalon](https://github.com/barakalon)!

## 6.2.4

### Patch changes

- Fix remote `$ref`s to complete schemas (#1087)
- Fix incorrect check for protocol by [@happycollision](https://github.com/happycollision) (#1088)
- Fix missing parameters in operation object (#1090)

## 6.2.3

### Patch changes

- Fix tuples type generation by [@liangskyli](https://github.com/liangskyli) (#1085)

## 6.2.2

### Patch changes

- Fix path generation by [@HiiiiD](https://github.com/HiiiiD) (#991)
- If no type is specified, type as `unknown` by [@mitchell-merry](https://github.com/mitchell-merry) (#1049)
- Ensure not required parameters are created as optional properties by [@AplusKminus](https://github.com/AplusKminus) (#1053)
- Fix missing type defs (#1072)
- Deduplicate unions by [@mitchell-merry](https://github.com/mitchell-merry) (#1069)
- Fix tuples type generation support by [@liangskyli](https://github.com/liangskyli) (#1011)

## 6.2.1

### Patch changes

- Fix `$ref`’d parameters missing (#1061)
- Fix `oneOf` number const (#1056) by [@qnp](https://github.com/qnp)

## 6.2.0

### Minor changes

- New `--empty-objects-unknown` flag for better control over unspecified object types’ default shape by [@duncanbeevers](https://github.com/duncanbeevers) (#1032)

### Patch changes

- JSDoc improvements by [@mitchell-merry](https://github.com/mitchell-merry) (#1029)
- Fix readonly nullable properties by [@mtth](https://github.com/mtth) (#1036)
- Tiny QoL improvements to invalid schema errors (#1043)

## 6.1.1

### Patch changes

- Fix response key for HTTP ranges (#1010) [@stefanmaric](https://github.com/stefanmaric)
- Escape constant string in generated schema (#1014) [@mvdbeek](https://github.com/mvdbeek)
- Support fully-qualified refs as discriminator mapping values (#1017) [@sgrimm](https://github.com/sgrimm)
- Improve behavior of allOf + required properties (#1027) [@Swiftwork](https://github.com/Swiftwork)
- Make params non-nullable even if all params are optional (#1022) [@sgrimm](https://github.com/sgrimm)

## 6.1.0

### Minor changes

- Adds `webhook` typings by [@yacinehmito](https://github.com/yacinehmito) (#1001)
- Use undici’s `fetch()` instead of `request()` which can be overridden locally by [@yacinehmito](https://github.com/yacinehmito) (#1002)
- Adds type helpers only when used by [@imagoiq](https://github.com/imagoiq) (#992)

### Patch changes

- Fixes bug in glob output by [@BTMPL](https://github.com/BTMPL) (#999)
- Fixes header casing by [@HiiiiD](https://github.com/HiiiiD) (#990)
- Fixed multiple causes of bug #988 “cannot read properties of undefined” by [@HiiiiD](https://github.com/HiiiiD) and [@yacinehmito](https://github.com/yacinehmito) (#990 and #1002)

## 6.0.3

### Patch changes

- Fixed `nullable: true` (#983)
- Fixed `additionalProperties` bug (#983)

## 6.0.2

### Patch changes

- Fixes #975 where `#/components/examples` were being parsed as schema objects

## 6.0.1

### Patch changes

- Remove `postinstall` hook only meant for dev

## 6.0.0

## ⚠️ Breaking changes

- Dropped Prettier formatting and all formatting options. Now, simply format at your discretion (or not at all!)
- Dropped support for Swagger 2.0
- Dropped Node 14 support (it still works for now, but Node 14 bugs won’t be fixed if any arise)
- `--version` was changed to return the version of this library (also by dropping Swagger 2.0 support the old usage was no longer needed)
- Dropped `--raw-schema`. Your entry schema MUST be valid and complete (however, your $refs to subschemas may be partials).
- Dropped `--make-paths-enum` because it was incompatible with `--path-params-as-types`
- Dropped the CLI aliases `-it` and `-ap` (specify the full -`-immutable-types` or `--additional-properties` flag)
- Empty content: `{}` now returns `never`. Dropped the `--content-never` flag as this is now the default behavior.
- Renamed and upgraded the Node API’s `formatter()` function to `transform()` and `postTransform()`. It’s an overall improvement on the original concept with even more power than before.

### Major changes

- Sped up type generation by **3×** by dropping Prettier & optimizing deep-object crawl speed
- OpenAPI 3.1 support for `discriminator` and polymorphic types
- Complete codebase rewrite and cleanup
- Now ships modern ESNext code rather than ES2018
- Improved internal types & documentation
- Test cleanup, now powered by Vitest
- New `transform()` and `postTransform()` hooks give you more control in overriding/extending generated types

### Minor changes

- More accurate types for `oneOf` / `anyOf` / `allOf` (#894)
- `--immutable-types` has a new `-t` alias
- Addition of path.default types
- Support `nullable` as type arrays for OpenAPI 3.1 (#898)

### Patch changes

- Fixed multiple bugs with deep-linked remote schemas and complex `$ref`s
- Fixed `anyOf` intersections resulting in unexpected type signatures
- Fixed `[string, null]` generating as `unknown`
- Fixed `{ property: unknown; }` with `allOf` union
- Fixed `requestBody` missing `content` property
- Fixed headers missing remote `$ref`s

## 5.4.0

### Minor changes

- New `--content-never` flag forces never response body by [@duncanbeevers](https://github.com/duncanbeevers) (#905)

### Patch changes

- Empty strings are now allowed for properties like `@default` by [@duncanbeevers](https://github.com/duncanbeevers) (#906)
- Throws friendlier error on bad `--prettier-config` path by [@duncanbeevers](https://github.com/duncanbeevers) (#909)
- Objects are now allowed for properties like `@default` by [@duncanbeevers](https://github.com/duncanbeevers) (#910)
- Fixes `enum` export of operation paths by [@duncanbeevers](https://github.com/duncanbeevers) (#912)

## 5.3.0

### Minor changes

- New `--make-paths-enum` CLI flag by [@berzi](https://github.com/berzi) (#883)
- New `--path-params-as-types` CLI flag by [@Powell-v2](https://github.com/Powell-v) (#891)
- Supports `/** @constant */` JSDoc comments by [@PhilipTrauner](https://github.com/PhilipTrauner) (#896)
- You can now add your own custom comment header at the top of every generated doc (#904)

### Patch changes

- Fixes inconsistent comment title (#904)

## 5.2.0

### Minor changes

- The `--export-type` flag was added to generate type instead of interface by [@dominikdosoudil](https://github.com/dominikdosoudil) (#868)
- Updated schemas & examples

### Patch changes

- Tiny optimizations for a little speed boost (#881)
- Fixes CommonJS error for undici on older versions of Node (#879)

## 5.1.1

### Patch changes

- Removes CJS version from npm (to use CJS, use `openapi-typescript@4`). Version 5 switched to ESM as default anyway, and since tests are now testing ESM, the reliability of CJS was dubious (and there were TypeScript problems as well)
- Fixes type error when using TypeScript nightly (#847)
- Patches [security vulnerability with node-fetch](https://security.snyk.io/vuln/SNYK-JS-NODEFETCH-2342118) (by replacing with [undici](https://undici.nodejs.org/#/))

## 5.1.0

### Minor changes

- Adds constants support by [@sadfsdfdsa](https://github.com/sadfsdfdsa) (#831)

### Patch changes

- Fixes a syntax error caused by an empty `oneOf` by [@sadfsdfdsa](https://github.com/sadfsdfdsa) (#830)

## 5.0.1

### Patch changes

- Adds missing types for CJS build (#861)

## 5.0.0

### ⚠️ Breaking changes

- 5.x drops support for Node 12. If you’re still on Node 12, be sure to lock your version to 4.x.

### Major changes

- Updates this library to full ESM! ✨ This is the future of JavaScript, and is now natively supported in Node 14+.

### Minor changes

- Now supports a `URL()` as input to make ESM usage easier ([see example](https://github.com/openapi-ts/openapi-typescript/tree/5.x#-node))

## 4.5.0

### Minor changes

- Significantly-enhanced JSDoc output by [@sadfsdfdsa](https://github.com/sadfsdfdsa) (#797)

## 4.4.0

### Minor changes

- Adds TypeScript `@deprecated` comment to deprecated schema objects by [@bunkscene](https://github.com/bunkscene)

## 4.3.0

### Minor changes

- In many areas, changed out `any` with `unknown` (#769). See #554 for more explanation / context

### Patch changes

- An old bug is now gone! openapi-typescript would incorrectly generate `{ [key: string]: unknown }` for a type when it may have been a `string` or `number`. Now it will generate a more generic `unknown` type, unless it knows it’s dealing with an object for sure.

## 4.2.0

### Minor changes

- Reference arbitrary data on generated types via the `properties` key by [@Peteck](https://github.com/Peteck) (#626)

## 4.1.1

### Patch changes

- Fixes the remote schema URL cache being too long-lived by [@mbelsky](https://github.com/mbelsky) (#708)

## 4.1.0

### Minor changes

- New `--headersObject` and `--headers` CLI flags by [@ericzorn93](https://github.com/ericzorn93) (#764)

### Patch changes

- `"type": "file"` no longer generates unexpected results (#766)

## 4.0.2

### Patch changes

- Loading in-memory schemas through the JS API resulted in broken `$ref`s (#689)

## 4.0.1

### Patch changes

- Fixes `properties` + `anyOf` with only `required` properties by [@gr2m](https://github.com/gr2m) (#643)

## 4.0.0

### ⚠️ Breaking changes

- The Node.js API now returns a promise, and can no longer be run synchronously (a necessity because resolving remote schemas can never be synchronous). Other than that, there are no other breaking changes. CLI users are unaffected, and the types generated are backwards-compatible with previous versions.

### Major changes

- Now supports remote references (`$ref: "remote.yaml#/components/schemas/User`) 🎉 (#602)!

## 3.4.1

### Patch changes

- Fix glob accidentally generating empty folders alongside single-file schemas (#633)

## 3.4.0

### Minor changes

- Adds glob support thanks to [@sharmarajdaksh](https://github.com/sharmarajdaksh) (#615)
- Reverts #613 and adds a `--default-non-nullable` flag (#631)

## 3.3.1

### Patch changes

- Schema objects that have a `default:` property shouldn’t be marked as nullable (#613)

## 3.3.0

### Minor changes

- Changes default behavior of #585 to require an opt-in `--additional-properties` flag (#607)
- Adds `-c` shortcut alias for `--prettier-config` (#607)
- Adds `-it` shortcut alias for `--immutable-types` (#607)

## 3.2.4

### Patch changes

- `additionalProperties` now default to `true` per the OpenAPI 3.0 spec by [@mehalter](https://github.com/mehalter) (#583)

## 3.2.3

### Patch changes

- Fixed a parse error on `enum: []` (#563)
- Fixed another parse error on responses missing schemas (#565)
- Fixed a bug with the latest version of Prettier and `options.prettierConfig` (#566)

## 3.2.2

### Patch changes

- RequestBodies that had hyphens in their name would generate an error (#550). Thanks (again), [@ashsmith](https://github.com/ashsmith)!

## 3.2.1

### Patch changes

- Fixed an issue where a comment within a schema definition would break type gen (#548). Thanks, [@ashsmith](https://github.com/ashsmith)!

## 3.2.0

### Minor changes

- Added a new `--immutable-types` flag by [@dnalborczyk](https://github.com/dnalborczyk) (#522)

### Patch changes

- The `operations` interface inherits parameters properly by [@henhal](https://github.com/henhal) (#530)

## 3.1.2

### Patch changes

- Fixes package types for TypeScript projects (#520)

## 3.1.1

### Patch changes

- Better handles remote schema content types (#516)

## 3.1.0

### Minor changes

- Remote schema loading now follows redirects (#510)
- New `--auth` flag to access private schemas (#508)
- npm version now ships with ESM [package exports](https://nodejs.org/api/packages.html#packages_package_entry_points) for better interop between ESM & CommonJS (#509)

### Patch changes

- Fixes an OpenAPI V2 parameter bug by [@yamacent](https://github.com/yamacent) (#489)

## 3.0.4

### Patch changes

- If using OpenAPI 2.0, and you didn’t have `definitions`, an unexpected error was encountered. This is now fixed.

## 3.0.3

### Patch changes

- Improves handling of complex `oneOf` by [@gr2m](https://github.com/gr2m) (#491)

## 3.0.2

### Patch changes

- Fixed `requestBodies` transform by [@radist2s](https://github.com/radist2s) (#474)
- Fixed enum bug containing `null` by [@FedeBev](https://github.com/FedeBev) (#492)

## 3.0.1

### Patch changes

- Fixed generation bug where responseBodies that contained both a `$ref` and `operationId` generated invalid TypeScript (#464)

## 3.0.0

### Major changes

- This is marked as a breaking version for safety. Swagger v2 users should be able to migrate to `3.0.0` with no problems; OpenAPI v3 users will either experience no changes or minor changes that should be an overall improvement.

### Minor changes

- Adds long-requested paths support to Swagger v2 schemas
- Adds more compact comments, resulting more readable generated types

### Patch changes

- Fixes bugs in paths generation (missing $refs support in areas, inconsistent generation)

## 2.5.0

### Minor changes

- Comments can now be single-line, saving some needed space in the specs (#443)

### Patch changes

- `additionalProperties.oneOf` is now generating as expected (#442)

## 2.4.2

### Patch changes

- Fixes `paths.requestBody.content` possibly missing by [@robertmassaioli](https://github.com/robertmassaioli) (#369)
- Fix: check if path item is method operation by [@rendall](https://github.com/rendall) (#366)

## 2.4.1

### Patch changes

- escape quotes in enum string values by [@gr2m](https://github.com/gr2m) (#365)

## 2.4.0

### Minor changes

- Add `operations` interface by [@gr2m](https://github.com/gr2m) (#353)

## 2.3.4

### Patch changes

- Allow `$ref: 'foo.yaml#bar'` syntax, but cast to `any` type (TODO: full external schema support) (#354)

## 2.3.3

### Patch changes

- `$refs` in paths now respect optional parameters (#352) by [@gr2m](https://github.com/gr2m)

## 2.3.2

### Patch changes

- Handle parameters on paths as well as methods by [@samdbmg](https://github.com/samdbmg) (#347)

## 2.3.1

### Patch changes

- Set index type to all possible values (#348)

## 2.3.0

### Minor changes

- `requestBody` and `$ref`-type parameters added in response types by [@gr2m](https://github.com/gr2m)

🐣 Minor Changes

- responses without content schemas changed from `any` to `never` or `unknown` by [@gr2m](https://github.com/gr2m)

## 2.2.0

### Minor changes

- New name! Now published at `openapi-typescript`.
- Added paths support (#328)

## 2.1.0

### Minor changes

- Support for components.responses (#258)
- Adds tuple support (#293)

### Patch changes

- Fix missing port bug (#252)
- additionalProperties interpolation, primitive enums (#266)
- bubble up the error message / improve error message when failing to parse the schema (#269)
- Improve error message when server is unreachable (#288)

## 2.0.0

### Major changes

- OpenAPI 3.0 support (#223)
- Schema names are no longer transformed (e.g. `UserRole` is now `definitions['user']['role']`). See README for migration instructions. (#223)
- Flags with “deprecated” warnings in `1.x` were dropped and no longer work (#223)

### Minor changes

- Adds support for JSDoc comments (#223)
- Support for null values (#223)
- Improves Prettier config resolution (#224)
- Improves array and object handling (#226)

## 1.7.1

### Patch changes

- Now handles the `@` character in namespaces thanks to [@sorin-davidoi](https://github.com/sorin-davidoi) 🎉
- Updates Prettier to `2.0`

## 1.7.0

### Minor changes

- Swagger v3 is no longer unsupported! 🎉 But it’s in beta. Which means errors will probably arise. Please test it out on your existing v3 schema, and file any bugs here.
- The `--swagger` flag is now deprecated; this library will automatically parse the version from the schema.

### Minor changes

- Fixes a bug where `additionalProperties` weren’t respected for nested `properties` (#92).

## 1.6.2

- Fixes an issue where `--camelcase` wouldn’t camelCase `$ref`s properly

## 1.6.1

### Patch changes

- Fixes a bug where a definition with a missing `type` would be skipped, rather than assume it’s an `object` like Swagger does by default.

## 1.6.0

### Minor changes

- Adds Property mapper function (see README) that supports `x-nullable` and other properties by [@atlefren](https://github.com/atlefren) (#118)

## 1.5.0

### Minor changes

- Convert names containing spaces to use underscores (#75) thanks to [@svnv](https://github.com/svnv)

## 1.4.0

### Minor changes

- Puts out JSDoc thanks to [@lbenie](https://github.com/lbenie)

## 1.3.1

### Patch changes

- Fix nested arrays (#54)

## 1.3.0

### Minor changes

- The `--nowrapper` flag was added to the CLI, courtesy of [@scvnathan](https://github.com/scvnathan) (#33). Now you don’t have to wrap your interfaces if you don’t want to!

## 1.2.2

### Patch changes

- This fixes underscores from accidentally appearing in some TypeScript interface names (#29)

## 1.2.1

### Patch changes

- Swagger properties in `kebab-case` would break generation unless they were converted to `--camelcase` (#13). This has been fixed! 🎉 You still have the option of converting to `--camelcase`, but now you can keep `kebab-case` too if needed

## 1.2.0

### Minor changes

- Adds `--wrapper` option, letting you specify any namespace or module wrapper for exporting types. See the README for full description

### ⚠️ Breaking changes

- `--namespace` and `--export` options are now deprecated, in favor of the more versatile `--wrapper`

## 1.1.3

### Patch changes

- Now supports an `--export` option to export namespaces thanks to [@tpdewolf](https://github.com/tpdewolf)

## 1.1.2

### Patch changes

- No longer generates empty interfaces (caused by top-level definitions being array types, referencing other definitions)

## 1.1.1

### Patch changes

- Improves enum generation to be simpler-to-use (values are now just hardcoded inline, rather than trying to use TypeScript enums).

## 1.1.0

### Major changes

- Changes default behavior to preserve `snake_case` properties (you can still convert with `--camelcase`)

### Minor changes

- Bundles & ships with [@pika/pack](https://github.com/pikapkg/pack)

## 0.3.1

### Patch changes

- Falls back to `object` if it can’t grab properties

## 0.3.0

### Minor changes

- Different API, now requires `namespace` as 2nd parameter. Because namespacing is good.

### Patch changes

- Maybe a bug; maybe not—if a Swagger spec had a common name like `Error` it would break your build if another type extended from it

## 0.2.1

### Patch changes

- Fixes bug where number enums names could be generated.

## 0.2.0

### Minor changes

- Supports TypeScript enums

## 0.1.0

### Minor changes

- Exists
