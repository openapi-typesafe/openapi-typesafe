---
"openapi-typesafe": patch
---

A schema `$ref` into the keywords of another schema, such as
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
`type: string` or `type: object` has no type of its own, so its target is written inline.

New opt-in fix `ref-pointers` (`--fix ref-pointers`): the same type also where the original compiled
through an index signature (`--additional-properties`) as `unknown`.
