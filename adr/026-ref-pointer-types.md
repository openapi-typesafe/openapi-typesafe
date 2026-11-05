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
   positional `parameters` index. Every shape it does not model (`enum`, `not`, `$ref` chains, discriminators, `--read-write-markers`, `patternProperties`, mixed
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
   and path item `parameters/N`) is not indexed at all: the target schema is written inline (its own `$ref` is
   followed). A target that would be written inside itself keeps the original type. This replaces
   the draft's merging and `Extract`, so no new self-reference appears.
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
