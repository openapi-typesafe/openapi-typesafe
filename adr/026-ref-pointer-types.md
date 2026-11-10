# ADR-026: Types of `$ref` pointers into schema keywords

- Status: Accepted
- Date: 2026-11-04

## Context

A schema `$ref` may point into another schema, not only at a component:
`#/paths/~1a/get/responses/200/content/application~1json/schema/items/properties/time`,
`#/components/schemas/Base/allOf/0/properties/id`, `#/components/schemas/A/definitions/B`,
`#/paths/~1a/get/parameters/0/schema`. The original (`refType`) indexes every segment by name and
skips `properties`. The generated types have no `schema`, `items`, `allOf`, `definitions` or
positional `parameters` member, and indexing past an optional or nullable value is an error, so in
the compat corpus such output fails with TS2339, TS2532 or (inside `WithRequired`) TS2344.

A first fix (rc.1 draft) rewrote every such pointer. The full-corpus check found two documents where
the original output compiled: with `--additional-properties` the media type schema has an index
signature, so `…["application/json"]["schema"]` is `unknown` and compiles. Rewriting it changes
output that compiles, which ADR-021 forbids without a fix name. The draft also merged `allOf`
members and narrowed `anyOf` members with `Extract`, which added TS2502 self-references in two
documents that were already broken.

## Decision

1. **Default only where the original surely does not compile.** `originalIndexFails` walks the
   document as TypeScript walks the generated types, and answers true only where the error is sure:
   a key with no property and no index signature (`--additional-properties`, schema
   `additionalProperties`), a key a primitive `type` does not have (`string["schema"]`), a value
   that may be `undefined` or `null` indexed further, a key of an array, an optional
   `requestBody` or response header (one without `required: true`), an `allOf` whose parts all miss
   the key (where exactly one part of the intersection has it, the walk reads that part, so `allOf`
   next to `properties` is no longer opaque), a pure `anyOf` / `oneOf` where a member misses it, a
   positional `parameters` index, a key of `unknown`: a schema with no `type` and no object
   keywords, or a value read through `[key: string]: unknown` (an `allOf` of such parts reads
   `unknown & unknown`, which is `unknown`; next to a part that has the key it reads
   `unknown & T`, which is `T`). Every shape it does not model (`enum`, `not`, `$ref` chains, discriminators, `--read-write-markers`, `patternProperties`, mixed
   composition) counts as compiling, so that output stays byte-identical. The walk reads the
   generated type as `coreType` writes it: one `type` name decides alone (`type: string` with
   `items` or `properties` is `string`), and `type: object` without object keywords is
   `Record<string, never>`, whose every key is `never` and compiles, as does every key after it.
2. **The corrected type.** The `schema` of a media type, header or component parameter is left out,
   `items` of an array is `[number]`, `additionalProperties` of an object is `[string]`; on a type
   without that member (`type: string` with `items`) the keyword has no type (point 3). `$defs`
   members are read through `NonNullable`, and a value that is not surely present is wrapped in
   `NonNullable` before it is indexed.
3. **A segment with no type of its own** (`allOf/N`, `anyOf/N`, `definitions`, `not`, operation
   and path item `parameters/N`) is not indexed at all: the target schema is written inline (its
   own `$ref` is followed). A target that would be written inside itself keeps the original type.
   This replaces the draft's merging and `Extract`, so no new self-reference appears. The target
   is typed at the location the generator types the node at (`generated-location.ts`:
   `properties` and `allOf/N` left out, `parameters/0` named `parameters/<in>/<name>`), not at
   the pointer: that location names its `--enum` declaration and `--enum-values` array, so the
   inline copy shares them. Typed at the pointer, it declared a second TypeScript enum with the
   same members, which is not assignable to the first. A node under a keyword the generator does
   not type (`definitions/A`, `not`) is typed nowhere else and keeps its pointer as its location,
   so its names stay as they were.
4. **`WithRequired` of an absent target** gets `NonNullable<…>`: `keyof (T | undefined)` is `never`.
5. **Fix `ref-pointers`.** Where the original compiles through an index signature, the corrected
   type comes only with `--fix ref-pointers` (and `all`), as every other output fix (ADR-021). Its
   harness option sets are `fix=ref-pointers` and `fix=ref-pointers+additional-properties`.

## Alternatives

| Option | Pro | Con |
| --- | --- | --- |
| Gate by a simulated TypeScript check (chosen) | Output that compiles never changes; no fix name needed for broken output | A second walk of the document that must stay in step with the object type rules |
| Rewrite every pointer by default | One code path | Changes compiling output (ADR-021) |
| Everything behind the fix | Simple | Output that does not compile stays broken by default |
| Run TypeScript on the output | Exact | Far too slow for a generator; the type checker is not a dependency |

## Consequences

- `generated-shape.ts` mirrors the object type rules (required keys, `--default-non-nullable`,
  `--properties-required-by-default`, `--exclude-deprecated`); a change there must change both. The
  compat harness checks it: a `different` case in a default option set is a regression.
- In 2.0 `ref-pointers` becomes the default with the other fixes.

## Amendment (2026-11-09): parameter `$ref`s to another operation's parameters

The full compatibility run found `$ref`s to a parameter object, not a schema:
`parameters: [{ $ref: "#/paths/~1chargers/get/parameters/0" }]`. The original writes them as the
parameter's location and name, `paths["/chargers"]["get"]["parameters"]["query"]["field[]"]`. A
location whose parameters are all optional is an optional member (`query?:`), so that does not
compile (TS2339), and a `$ref` to an OpenAPI 3.2 `in: querystring` parameter indexed a member
`querystring` that the generated types do not have (ADR-020 types it as `query`).

The same rule as above applies: only a type that surely fails changes. The parameters of the
target's list are read as the generator types them (the operation's merged with its path item's,
without those that `--exclude-deprecated` drops); when none in the parameter's location is
required, the location is wrapped in `NonNullable` before the name; a `querystring` parameter
reads `["query"]` unless `in: query` parameters sit next to it, where it is not typed at all. A
list the generator types elsewhere (a `$ref` operation or path item) or does not type (a callback)
keeps the original type. This lives in `document/referenced-parameter.ts`, next to the parameter
types, not in the schema pointer walk: the target is a parameter object, whose generated shape is
the `parameters` member, not a schema type.

## Amendment (2026-11-10): headers, parameters, markers and pointers through a `$ref`

The hunt after rc.4 found pointers whose original type does not compile and that the walk did
not model. The rule stays: only a type that surely fails changes, and the walk writes the type
the generator gives the target.

1. **`content` of a header or parameter.** Without a `schema`, a header is a map of its media
   types, or with the `parameter-header-content` fix the type of its first media type; a
   parameter is `string` without the fix (ADR-021, 2026-11-10). Neither has a `content` or
   `schema` member. The `content` segment is skipped in the media type form; in the first media
   type form the next segment must name that media type and adds nothing. Where the type is
   `string`, where `content` sits next to a `schema` (the schema wins), and at the end of a
   pointer in the first media type form, the target is typed in place. The original index of the
   media type form fails unless a media type is named `content`; then it keeps its type.
2. **`--read-write-markers`.** Every member counted as opaque, so no pointer was ever corrected.
   Now only a property that is only `readOnly` or only `writeOnly` is special: its type is
   `$Read<T>` or `$Write<T>`, which has no other member, so the original fails through it and the
   walk types the target in place. A pointer to that property keeps `$Read<T>`.
3. **Where a property is.** The walk carries the JSON Pointer of each node, also through a
   `$ref`, so a property with a `default` is required or optional by its own location, as the
   object type rules decide (`isInputLocation`), not by the location of the pointer.
4. **`--exclude-deprecated` operations.** A path item types a deprecated operation `never`; a
   pointer into it is typed in place.
5. **A pointer through a `$ref`.** `resolveDocumentRef` read a pointer as written and warned
   `REF_NOT_FOUND` when it passed through a `$ref` (`Wrap/properties/o/properties/v`, where `o`
   is a `$ref`), so every rule that looks up a target by pointer (deprecated, `readOnly`,
   discriminators) missed it. A key a node does not have is now read from the node's `$ref`
   target, with the same cycle check; a key the node has is read from it, so a pointer to a 3.1
   sibling of a `$ref` stays as written. The local workaround in the deprecated scan is removed.

`generated-shape.ts` grew past the file limit, so the node and pointer basics moved to
`located-node.ts` and the property rules (optional, excluded, marked, presence) to
`property-shape.ts`. The Consequences above apply to both files.
