---
title: Advanced
description: Advanced usage as well as tips, tricks, and best practices
---

# Advanced usage

Advanced usage and various topics. Interpret this as loose recommendations for _most_ people, and feel free to disregard if it doesn’t work for your setup!

## Debugging

To enable debugging, set `DEBUG=openapi-ts:*` as an env var like so:

```sh
$ DEBUG=openapi-ts:* npx openapi-typesafe schema.yaml -o my-types.ts
```

To only see certain types of debug messages, you can set `DEBUG=openapi-ts:[scope]` instead. Valid scopes are `redoc`, `lint`, `bundle`, and `ts`.

Debug messages go to stderr, so they do not mix with types written to stdout.

## Enum extensions

`x-enum-varnames` can be used to have another enum name for the corresponding value. This is used to define names of the enum items.

`x-enum-descriptions` can be used to provide an individual description for each value. This is used for comments in the code (like javadoc if the target language is java).

`x-enum-descriptions` and `x-enum-varnames` are each expected to be list of items containing the same number of items as enum. The order of the items in the list matters: their position is used to group them together.

Example:

::: code-group

```yaml [my-openapi-3-schema.yaml]
ErrorCode:
  type: integer
  format: int32
  enum:
    - 100
    - 200
    - 300
  x-enum-varnames:
    - Unauthorized
    - AccessDenied
    - Unknown
  x-enum-descriptions:
    - "User is not authorized"
    - "User has no access to this resource"
    - "Something went wrong"
```

:::

Will result in:

::: code-group

```ts [my-openapi-3-schema.d.ts]
export enum ErrorCode {
  // User is not authorized
  Unauthorized = 100,
  // User has no access to this resource
  AccessDenied = 200,
  // Something went wrong
  Unknown = 300
}
```

:::

To generate in this fashion, `--enum` needs to be specified on the [command line](cli.md#flags).

Alternatively you can use `x-enumNames` and `x-enumDescriptions` ([NSwag/NJsonSchema](https://github.com/RicoSuter/NJsonSchema/wiki/Enums#enum-names-and-descriptions)).

## Styleguide

Loose recommendations to improve type generation.

### Redocly rules

To reduce errors in TypeScript generation, the following built-in rules are recommended to enforce in your [Redocly config](https://redocly.com/docs/cli/rules/built-in-rules/):

| Rule                                                                                          |    Setting     | Reason                         |
| :-------------------------------------------------------------------------------------------- | :------------: | :----------------------------- |
| [operation-operationId-unique](https://redocly.com/docs/cli/rules/built-in-rules/#operations) |    `error`     | A repeated ID gets a numbered `operations` key (`listItems2`) |
| [operation-parameters-unique](https://redocly.com/docs/cli/rules/built-in-rules/#parameters)  |    `error`     | Prevents missing params        |
| [path-not-include-query](https://redocly.com/docs/cli/rules/built-in-rules/#parameters)       |    `error`     | Prevents missing params        |
| [spec](https://redocly.com/docs/cli/rules/built-in-rules/#special-rules)                      | `3.0` or `3.1` | Enables better schema checks   |

### Embrace `snake_case` in JS

Different languages have different preferred syntax styles. To name a few:

- `snake_case`
- `SCREAMING_SNAKE_CASE`
- `camelCase`
- `PascalCase`
- `kebab-case`

It’s tempting to want to rename API responses into `camelCase` that most JS styleguides encourage. However, **avoid renaming** because in addition to being a time sink, it introduces the following maintenance issues:

- generated types (like the ones produced by openapi-typesafe) now have to be manually typed again
- renaming has to happen at runtime, which means you’re slowing down your application for an invisible change
- name transformation utilities have to be built & maintained (and tested!)
- the API probably needs `snake_case` for requestBodies anyway, so all that work now has to be undone for every API request

Instead, treat “consistency” in a more holistic sense, recognizing that preserving the API schema as-written is better than adhering to JS style conventions.

### Enable `noUncheckedIndexedAccess` in TSConfig

Enable `compilerOptions.noUncheckedIndexedAccess` in TSConfig ([docs](https://www.typescriptlang.org/tsconfig#noUncheckedIndexedAccess)) so any `additionalProperties` key will be typed as `T | undefined`.

The default behavior of [Additional Properties](https://swagger.io/docs/specification/data-models/dictionaries/) (dictionaries) will generate an index signature, `{ [key: string]: T; }`, which can very easily produce null reference errors. TypeScript lets you access any arbitrary key without checking it exists first, so it won’t save you from typos or the event a key is just missing.

### Be specific in your schema

openapi-typesafe will **never produce an `any` type**. Anything not explicated in your schema may as well not exist. For that reason, always be as specific as possible. Here’s how to get the most out of `additionalProperties`:

<table>
  <thead>
    <tr>
      <td style="width:10%"></td>
      <th scope="col" style="width:40%">Schema</th>
      <th scope="col" style="width:40%">Generated Type</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">
        Bad
      </th>
      <td>

```yaml
type: object
```

</td>
      <td>

```ts
Record<string, never>;
```

</td>
    </tr>
    <tr>
      <th scope="row">
        Less Bad
      </th>
      <td>

```yaml
type: object
additionalProperties: true
```

</td>
      <td>

```ts
{ [key: string]: unknown; }
```

</td>
    </tr>
    <tr>
      <th scope="row">
        Best
      </th>
      <td>

```yaml
type: object
additionalProperties:
  type: string
```

</td>
      <td>

```ts
{ [key: string]: string; }
```

</td>
    </tr>

  </tbody>
</table>

::: info Properties next to `additionalProperties`
TypeScript checks an index signature against every key of a value, declared ones too. So for
`properties: { total: { type: integer } }` next to `additionalProperties: { type: string }`, the
original's `{ total: number } & { [key: string]: string }` took no value with `total`. The index
signature also takes the property types it does not admit: `[key: string]: string | number`. A key
that no property declares can then hold a `number` too; TypeScript has no type for "the other keys".
A property type that the index type already admits adds nothing, so `{ name: string }` next to
`string` stays `[key: string]: string`. A `$ref` property type is always added, because the generator
does not compare referenced types.
:::

When it comes to **tuple types**, you’ll also get better results by representing that type in your schema. Here’s the best way to type out an `[x, y]` coordinate tuple:

<table>
  <thead>
    <tr>
      <td style="width:10%">&nbsp;</td>
      <th scope="col" style="width:40%">Schema</th>
      <th scope="col" style="width:40%">Generated Type</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">
        Bad
      </th>
      <td>

```yaml
type: array
```

</td>
      <td>

```ts
unknown[]
```

</td>
    </tr>
    <tr>
      <th scope="row">
        Less Bad
      </th>
      <td>

```yaml
type: array
items:
  type: number
```

</td>
      <td>

```ts
number[]
```

</td>
    </tr>
    <tr>
      <th scope="row">
        Best
      </th>
      <td>

```yaml
type: array
items:
  type: number
maxItems: 2
minItems: 2
```

(with [`--array-length`](cli.md#arraylength))

— or —

```yaml
type: array
items: false
minItems: 2
prefixItems:
  - type: number
  - type: number
```

(`items: false` closes the tuple and `minItems` requires both elements, as the
[`prefix-items`](cli.md#prefix-items) fix reads them)

</td>
      <td>

```ts
[number, number];
```

</td>
    </tr>

  </tbody>
</table>

### Use `oneOf` by itself

OpenAPI’s composition tools (`oneOf`/`anyOf`/`allOf`) are powerful tools for reducing the amount of code in your schema while maximizing flexibility. TypeScript unions, however, don’t provide [XOR behavior](https://en.wikipedia.org/wiki/Exclusive_or), which means they don’t map directly to `oneOf`. For that reason, it’s recommended to use `oneOf` by itself, and not combined with other composition methods or other properties. e.g.:

#### Avoid

::: code-group

```yaml [my-openapi-3-schema.yaml]
Pet:
  type: object
  properties:
    type:
      type: string
      enum:
        - cat
        - dog
        - rabbit
        - snake
        - turtle
    name:
      type: string
  oneOf:
    - $ref: "#/components/schemas/Cat"
    - $ref: "#/components/schemas/Dog"
    - $ref: "#/components/schemas/Rabbit"
    - $ref: "#/components/schemas/Snake"
    - $ref: "#/components/schemas/Turtle"
```

:::

This generates the following type which mixes both TypeScript unions and intersections. While this is valid TypeScript, it’s complex, and inference may not work as you intended. But the biggest offense is TypeScript can’t discriminate via the `type` property:

::: code-group

```ts [my-openapi-3-schema.d.ts]
  Pet: ({
    /** @enum {string} */
    type?: "cat" | "dog" | "rabbit" | "snake" | "turtle";
    name?: string;
  }) & (components["schemas"]["Cat"] | components["schemas"]["Dog"] | components["schemas"]["Rabbit"] | components["schemas"]["Snake"] | components["schemas"]["Turtle"]);
```

:::

#### Prefer

::: code-group

```yaml [my-openapi-3-schema.yaml]
Pet:
  oneOf:
    - $ref: "#/components/schemas/Cat"
    - $ref: "#/components/schemas/Dog"
    - $ref: "#/components/schemas/Rabbit"
    - $ref: "#/components/schemas/Snake"
    - $ref: "#/components/schemas/Turtle"
PetCommonProperties:
  type: object
  properties:
    name:
      type: string
Cat:
  allOf:
    - "$ref": "#/components/schemas/PetCommonProperties"
  properties:
    type:
      type: string
      enum:
        - cat
```

:::

The resulting generated types are not only simpler; TypeScript can now discriminate using `type` (notice `Cat` has `type` with a single enum value of `"cat"`).

::: code-group

```ts [my-openapi-3-schema.d.ts]
Pet: components["schemas"]["Cat"] | components["schemas"]["Dog"] | components["schemas"]["Rabbit"] | components["schemas"]["Snake"] | components["schemas"]["Turtle"];
Cat: { type?: "cat"; } & components["schemas"]["PetCommonProperties"];
```

:::

_Note: you optionally could provide `discriminator.propertyName: "type"` on `Pet` ([docs](https://spec.openapis.org/oas/v3.1.0#discriminator-object)) to automatically generate the `type` key, but is less explicit._

While the schema permits you to use composition in any way you like, it’s good to always take a look at the generated types and see if there’s a simpler way to express your unions & intersections. Limiting the use of `oneOf` is not the only way to do that, but often yields the greatest benefits.

### Discriminator values

A discriminator gives each member schema a value of its property. A `mapping` entry names it; a
member that no entry names gets its schema name, as the
[Discriminator Object](https://spec.openapis.org/oas/v3.1.0#discriminator-object) says. If the
member's property has an `enum` or `const` that does not list that value, no value of the member
matches the discriminator, and where the generator adds the value to the member the property is
`never`. openapi-typesafe warns about each such member:

```yaml
Item:
  oneOf: [{ $ref: "#/components/schemas/Episode" }]
  discriminator: { propertyName: type } # Episode gets the value "Episode"
Episode:
  type: object
  properties:
    type: { type: string, enum: [episode] } # does not list "Episode"
```

Add a mapping entry for the value the property allows (`mapping: { episode:
"#/components/schemas/Episode" }`).

A `mapping` value is a schema name (`cat: Cat`) or a URI reference (`cat:
"#/components/schemas/Cat"`). A value that is a key of `components.schemas` is read as that
schema's name, as OpenAPI 3.1.1 recommends for a value that could be either; write a relative file
reference that matches a schema name as `./Cat`. Any other value is a URI reference.

A member is a schema that the discriminator's `oneOf`, `anyOf` or `mapping` names, or one that
`allOf`s the owner, also through other schemas (`Lion: { allOf: [Cat] }`, `Cat: { allOf: [Pet] }`).
Below a schema with its own discriminator of the property, the schemas are that one's members.
With [`--fix allof-discriminated-union`](./cli.md#allof-discriminated-union), a schema that `allOf`s
a union which neither lists nor maps it reuses the union and gets no value, so it is no member.

## Enum values arrays

`--enum-values` exports each enum's values as an array typed by the place of its schema in the
generated types:

```ts
export const petStatusValues: ReadonlyArray<FlattenedDeepRequired<components>["schemas"]["Pet"]["status"]> = ["available", "sold"];
```

Where that type cannot hold the values, the array is typed by its own values instead, so the file
compiles (`ReadonlyArray<"available" | "sold">`):

- the place has no type of its own: a schema under `definitions`, an `allOf` member, a positional
  operation parameter, or a property of a schema whose type is `unknown` (an `anyOf` with a
  variant that has only `required`), whether the property is the schema's own or one of another
  `anyOf` variant;
- an `anyOf` member is an array of the enum and another member is not an array;
- the enum is empty (`enum: []`): its type is `never`, so the array is `readonly never[]`;
- `--read-write-markers` wraps the property in `$Read<T>` or `$Write<T>`, an object type;
- the enum is an `additionalProperties` value next to `properties` or `patternProperties`, or,
  with the `unevaluated-properties` fix, an `unevaluatedProperties` value next to `properties`,
  `allOf`, `anyOf` or `oneOf`: the index signature, which `[string]` reads, holds their types too;
- the enum is an `additionalProperties` value of an `anyOf` / `oneOf` variant next to a variant
  that is not a record (a `string`, an object without `additionalProperties`): `[string]` cannot
  read that variant. A variant next to `null` keeps its type;
- the place surely admits other values too: an `anyOf` / `oneOf` member or a `prefixItems`
  element, whose place is the whole union or tuple (`FlattenedDeepRequired` reads a tuple as the
  union of its elements), next to siblings with other values or of another kind (an object, an
  array or a tuple), or an open tuple of the `prefix-items` fix, whose rest is `unknown`. A place
  that admits a wide type such as `string` keeps its type;
- the schema contradicts itself: an `allOf` of enums with different values, or a discriminator
  value that the property enum does not list. The type there admits fewer values, or none; this
  case also prints a warning that names the array and the values;
- the place is a tuple (`FlattenedDeepRequired` keeps a tuple inside a tuple as a tuple) that the
  values do not fill one by one: another number of values, or another order;
- the place is a built-in member of an array or a string (an enum property `sort` of a
  `prefixItems` element reads the array's `sort` method);
- the type there is one the check does not read as TypeScript does: an intersection of an object
  and an array (`allOf` items that type a property as an object in one and an array in another),
  `Omit` of an intersection with a union, or a tuple with optional or rest elements. Such a type
  cannot be shown to hold the values, so the array is typed by them.

Every other array keeps its type.

Arrays of one name are numbered: the elements of a `prefixItems` tuple share the tuple's place, so
a tuple `Pair` of two enums gives `pairValues` and `pairValues_2`. The numbers follow the
position in the tuple, also where a `$ref` to a later element comes first in the document. Two
tuples of one name (a tuple property `sort` of `Order` and a tuple schema `OrderSort`) are
numbered one after the other, in the order of the document: `orderSortValues` and
`orderSortValues_2` for the first, `orderSortValues_3` and `orderSortValues_4` for the second.
The same holds for the properties of the elements (`Shape` of two element objects, each with a
`kind` enum, gives `shapeKindValues` and `shapeKindValues_2`), of the `items` and of the record
values (`additionalProperties`, `patternProperties`, `unevaluatedProperties`). The numbers do not
depend on whether a `$ref` points into the schema.

## Inherited enums

A schema often narrows an enum it inherits through `allOf`:

```yaml
Pet:
  type: object
  properties:
    mode: { type: string, enum: [a, b, c] }
Cat:
  allOf:
    - $ref: "#/components/schemas/Pet"
    - type: object
      properties:
        mode: { type: string, enum: [a] }
```

With `--enum` each place declares its own TypeScript enum, and two TypeScript enums intersect to
`never`, so `Cat` was `Pet & { mode?: CatMode }` with no value for `mode`. A property of an
inline `allOf` item, or of the schema's own keywords next to the `$ref`, whose enum lists values
of the enum at the same place in the `$ref` item's schema is typed by that enum's members:

```ts
Cat: components["schemas"]["Pet"] & { mode?: PetMode.a };
```

The same holds for the array items, record values and tuple elements in such a property, for the
variants of an `anyOf` / `oneOf` there, and for an enum that the `$ref` item's schema gets
through a `$ref` (`Status.on`). `CatMode` is still
declared, so code that imports it keeps compiling, but `Cat` no longer uses it.

An enum member is no literal either: `PetMode & "a"` is `never` too. So each value is typed in the
form the other schema admits it in:

- A `const` (`mode: { const: a }`), or an enum that `--enum` keeps as a union of literals (one
  that lists `null` without the [`nullable-enums`](./cli.md#nullable-enums) fix, or one without
  `x-enum-*` names under `--conditional-enums`), gets the base enum's members: `PetMode.a`, and
  `PetMode.a | null` where it lists `null`.
- An enum whose base keeps its values as literals (`mode: { type: [string, "null"], enum: [a, b,
  null] }`) gets those literals: `mode?: "a"`.
- The base's enum is found through what wraps it: a one-item `allOf: [{ $ref }]` (the common way
  to add a `description`), and the variants of an `anyOf` / `oneOf`, such as
  `oneOf: [{ $ref: Status }, { type: "null" }]`. A variant that admits any value of the type
  (`{ type: string }`) or an object leaves the enum as it is: the intersection keeps its values.
- The bases are read through `allOf` chains: `Kitten: allOf: [$ref: Cat, { mode: [a] }]` with
  `Cat: allOf: [$ref: Pet, …]` gets `PetMode.a`, the enum `Cat` itself is typed by. A base whose
  property sits in its own `allOf` item is read too, and a cycle of `allOf` `$ref`s ends.
- The parts of one `allOf` are intersected with each other as well: a literal in the schema's own
  `properties` next to an inline `allOf` item whose property at that place is an enum gets that
  enum's members (`{ mode?: MixedMode.A } & { mode?: MixedMode }`). This is how a member's own
  discriminator value meets the [discriminator property](#discriminator-values) the generator adds.
  Of two enums there, the earlier part (the own keywords, then the items in order) takes the
  later one's members, so the two do not each take the other's.

When the property lists values the base does not (`enum: [a, d]`), no value of `Cat` can be
`d`: the type lists the values both list (`PetMode.a`), and a warning names the values
(`ENUM_VALUES_NOT_INHERITED`). Without a common value the type stays `never`, as the document
says, with the same warning. A property that the `allOf` leaves out of the base (`Omit<Pet,
"kind">` for a discriminator) keeps its own type. A property that is a `$ref` is typed by its
target wherever it is used, so it keeps its type too. Without `--enum` the types are unions of
literals, which intersect as they should, and nothing changes.

## JSONSchema $defs caveats

[JSONSchema $defs](https://json-schema.org/understanding-json-schema/structuring.html#defs) can be used to provide sub-schema definitions anywhere. However, these won’t always convert cleanly to TypeScript. For example, this works:

::: code-group

```yaml [my-openapi-3-schema.yaml]
components:
  schemas:
    DefType:
      type: object # an object schema keeps its $defs
      $defs:
        myDefType:
          type: string
    MyType:
      type: object
      properties:
        myType:
          $ref: "#/components/schemas/DefType/$defs/myDefType"
```

:::

This will transform into the following TypeScript:

::: code-group

```ts [my-openapi-3-schema.d.ts]
export interface components {
  schemas: {
    DefType: {
      $defs?: {
        myDefType: string;
      };
    };
    MyType: {
      myType?: NonNullable<components["schemas"]["DefType"]["$defs"]>["myDefType"]; // works
    };
  };
}
```

:::

However, this won’t:

::: code-group

```yaml [my-openapi-3-schema.yaml]
components:
  schemas:
    DefType:
      type: string # a string schema loses its $defs
      $defs:
        myDefType:
          type: string
    MyType:
      properties:
        myType:
          $ref: "#/components/schemas/DefType/$defs/myDefType"
```

:::

Because it will transform into:

::: code-group

```ts [my-openapi-3-schema.d.ts]
export interface components {
  schemas: {
    DefType: string;
    MyType: {
      myType?: NonNullable<components["schemas"]["DefType"]["$defs"]>["myDefType"]; // Error: Property '$defs' does not exist on type 'String'.
    };
  };
}
```

:::

So be wary about where you define `$defs` as they may go missing in your final generated types.

::: tip

When in doubt, you can always define `$defs` at the root schema level.

:::

## Untrusted documents

A document can refer to other files and URLs with `$ref`, and the generator loads them. By default
it loads any local file it can read and any `http(s)` URL it can reach, as openapi-typescript does.
For a document you did not write (from a vendor, a URL or a user), limit both:

```bash
npx openapi-typesafe ./vendor/openapi.yaml -o ./src/api/schema.d.ts \
  --local-ref-root ./vendor --remote-ref-hosts api.vendor.example
```

- `--local-ref-root` (`localRefRoot` in the Node API): local `$ref` files must be in this
  directory or below it. A relative path is relative to the working directory; the flag without a
  value means the working directory. Links are followed before the check, so a link inside the directory that
  points outside it is refused too. The root is a path or a `file:` URL of a directory; a URL of
  another protocol, a `file:` URL that names no local path (`file://host/specs/`), an existing
  file (`--local-ref-root api.yaml`, which refused every local `$ref`), also written with a
  trailing slash (`file:api.yaml/`), or a path below a file (`api.yaml/specs/`) fails with `CLI_FLAG_INVALID`
  (`CLI_CONFIG_INVALID` in `redocly.yaml`, `OPTION_INVALID` in the Node API) before anything
  loads, as does a `remoteRefHosts` that is no list of strings.
- `--remote-ref-hosts` (`remoteRefHosts`): remote `$ref` documents must come from these hosts,
  written as `name` (any port) or `name:port`. Hosts are compared as URLs write them, so case,
  a trailing dot, Unicode names, IPv6 with or without brackets (`::1`, `[::1]:8080`) and a
  default port (`api.example.com:443`) all match. An empty list (`--remote-ref-hosts=`) allows no
  remote `$ref`. Each redirect is checked against the list and at most 20 are followed. A listed
  name is trusted: it is not checked again after DNS resolution.
- Headers from your Redocly config go only to the URLs their patterns match, over HTTPS or to this
  machine unless a pattern starts with `http://`; each redirect hop gets only the headers its own
  URL matches ([Auth](/cli#auth)). This holds
  with or without the two flags.
- In `redocly.yaml`, an API can set its own limits as `local-ref-root` and `remote-ref-hosts`
  under `x-openapi-ts`; they replace the flags for that API (see
  [Multiple schemas](/cli#multiple-schemas)).
- The document you pass to the generator is never limited, only what it refers to; its own
  redirects are followed to any host.
- A remote document may refer only to other `http(s)` URLs. A `$ref` in it that names a local file
  (`file:///…`, or `C:/…`, which a URL base turns into a drive-letter path) is always refused.
- A `$ref` is a URL by the rule of the schema argument (`http:`, `https:` or `file:`, or another
  scheme followed by `//`); other text before a colon is part of a file name (`out:v2.yaml`,
  `C:/specs/pet.yaml`). An `http:` or `https:` `$ref` resolves against its document by the URL
  standard, as the schema argument resolves against the working directory, so
  `http:127.0.0.1:8080/pet.yaml` and `HTTPS://host/pet.yaml` are fetched, within
  `--remote-ref-hosts` (openapi-typescript read them as files below the document's folder). A
  `$ref` that starts with `http://` or `https://` keeps its text as the document's name, as in
  `redocly lint` (`http://LOCALHOST/x/../pet.yaml`), so the entries of
  `.redocly.lint-ignore.yaml` apply to it; the same document written two ways is linted twice,
  as `redocly lint` lints it, and bundled once. In a local document, a `file:` URL names its file (`file:pet.yaml` is next
  to the document), and a URL of another scheme (`s3://bucket/pet.yaml`) or a `file:` URL that
  names no local path is always refused (`unsupported-url`). openapi-typescript read both as
  paths below the document's folder (`./s3:/bucket/pet.yaml`, `./file:/specs/pet.yaml`).

A refused `$ref` fails with `SCHEMA_REF_FORBIDDEN` (CLI exit code `3`); `err.details` has the
`ref` and the `reason` (`outside-local-root`, `host-not-allowed`, `local-ref-from-remote`,
`unsupported-url`, or
`too-many-remote-documents`, `remote-document-too-large` and `remote-documents-too-large` from
[Limits](#limits)). The
[threat model](/security/threat-model) explains the risks (T3, T4).

## Limits

openapi-typesafe fails with a typed error (`err.code`, CLI exit code `3`) instead of crashing or
hanging when a document reaches one of these limits.

The limits on remote documents count per schema: one `openapiTS()` call, the schema of one CLI
run, or one API of a `redocly.yaml`. The CLI generates the APIs of a config one after another, so
a config with several APIs takes the memory of its largest one. The limits bound the memory that
remote documents can make a schema take, they do not make it small: Microsoft Graph beta
(71 MiB) peaks at about 1.6 GB of resident memory when loaded from a URL. Crafted remote documents
that stay just under the limits (a 127 MiB string, two of them, or a schema of almost 8 million
nodes that the output uses) peak at about 1.2 to 2.3 GB in our measurements, on Node.js 26 and
macOS with its default heap of 4 GB; the garbage collector takes more of the room it has. They
also finish within a heap of 2 GB (`--max-old-space-size=2048`, about the default on a machine
with 8 GB of memory), more slowly. Local files are not limited: they are as large as you made
them.

| Limit | What happens | Error code |
| :-- | :-- | :-- |
| A YAML or JSON file nested more than 100 levels deep | The YAML parser stops. A document passed as an object or as JSON text skips this limit | `SCHEMA_PARSE_FAILED` |
| About 550 levels of inline schemas, or a chain of about 900 `$ref`s where each schema refers to the next; while loading, also one object with more than about 100,000 keys (the schema loader passes the keys to one call) | The call stack runs out. The numbers are for the default Node.js stack and vary a little between runs and runtimes | `SCHEMA_TOO_DEEP` |
| A `$ref` that points at itself, or two `$ref`s that point at each other, with no schema in between | The cycle has no type | `SCHEMA_REF_INVALID` |
| A key named `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`, `toLocaleString`, `valueOf` or one of the `__define…` / `__lookup…` methods, where the schema loader reads keys, or a `constructor` entry whose value has a string `name` (a security scheme or header named `constructor`) | The schema loader (Redocly 1.x) cannot read it; the error lists every such key | `SCHEMA_KEY_UNSUPPORTED` |
| YAML aliases (`*name`) that expand a file to more than 1,000,000 nodes and to more than 100 times its written size (a "billion laughs" document) | The file is refused right after parsing, before anything walks it | `SCHEMA_PARSE_FAILED` |
| More than 10,000 remote documents for one schema (each document that refers to new URLs, without end) | The next remote document is refused before it is fetched. At most 16 remote documents are fetched at the same time | `SCHEMA_REF_FORBIDDEN` (reason `too-many-remote-documents`) |
| A remote document whose body is larger than 128 MiB once decoded (`gzip`, `deflate` and `br` are decoded while it arrives, so a small compressed body cannot fill the memory) | The body is read as a stream and the fetch stops at the limit, before the document is parsed. A `customFetch` in your Redocly config is limited too. The largest real document we know (Microsoft Graph beta) is 71 MiB | `SCHEMA_REF_FORBIDDEN` (reason `remote-document-too-large`, `details.maxDocumentBytes`) |
| Remote documents of one schema larger than 256 MiB together, decoded | The fetch that passes the total stops | `SCHEMA_REF_FORBIDDEN` (reason `remote-documents-too-large`, `details.maxTotalBytes`) |
| Remote documents of one schema that parse into more than 8,000,000 nodes together (keys and values; a dense body such as `[{},{},…]` takes far more memory than its bytes) | The parser stops at the limit, before the rest of the document is built. Microsoft Graph beta parses into 2.65 million nodes | `SCHEMA_REF_FORBIDDEN` (reason `remote-documents-too-many-nodes`, `details.maxNodes`) |
| A remote `$ref` or remote document that does not answer, or does not finish sending its body, within 60 seconds | The fetch stops. A request whose connection closes before any response (a kept-alive connection the server closed) is sent once more within the same 60 seconds. A `customFetch` in your Redocly config replaces this limit | `SCHEMA_INVALID` (a `$ref`) or `SCHEMA_LOAD_FAILED` (the document) |

Cyclic schemas are fine when the cycle goes through an object property
(`Node: { properties: { next: { $ref: Node } } }`): they generate recursive types. A cycle with no
object on it, such as two arrays of each other or two `allOf`s of each other, generates types that
TypeScript rejects with “is referenced directly or indirectly in its own type annotation”, as in
openapi-typescript. The common case is a JSON value schema whose `anyOf` or `oneOf` holds an array
of itself (`JSONValue: anyOf: [string, number, { type: array, items: { $ref: JSONValue } }]`). It
gives `JSONValue: components["schemas"]["JSONValue"][] | string | number`, and TypeScript defers
an array of itself only in a type alias, not in an interface property (TS2502). An array that sits
in an object property (`{ type: object, properties: { items: { type: array, … } } }`) is fine.

Names need no care: reserved words (`class`, `default`, `constructor`), TypeScript global names,
`__proto__`, Unicode, quotes, backslashes and line breaks in schema, property, enum, path and
parameter names all generate valid TypeScript.
