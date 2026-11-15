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

## Amendment (2026-11-10): pointers read through an index signature

rc.5 made an index signature hold the types of the properties next to it
(`withPropertyTypes`). The walk still read `[string]` as the `additionalProperties` type, so a
`$ref` to `Stats/additionalProperties` next to `properties` kept `Stats["additionalProperties"]`,
which now reads `number | { count?: number }`: it compiles, but admits values the target does not,
and a pointer one segment deeper did not compile, also with the fix. A `$ref` to a property that
`--exclude-deprecated` leaves out was read through the index signature in the same way, and a
`$ref` to `patternProperties/<pattern>` counted as opaque, so its failing original stayed.

1. **What the index signature holds.** `generatedMember` gives the signature's value as the one
   value schema it has (`additionalProperties` or a single pattern); several value schemas make a
   union it does not model, so they stay opaque, and an `unknown` value makes the signature
   `unknown`. The member is `isOtherType` where the type read is not the type of the node the key
   names: next to a property the generated type keeps, or for the key of a left-out property.
2. **The original through such a member is corrected by default.** It compiles, but it is not the
   target's type, which ADR-021 counts as wrong output, not as output to keep. The walk reads the
   document, not the types, so it cannot run the assignability proof that leaves a signature as it
   was when every property type fits: there the corrected type is the same type written inline.
   The same holds for a left-out property whose type is the signature's. This is the cost of not
   running the type proof in the walk; the compat harness shows how often it is paid.
3. **The corrected type.** `[string]` stands for `additionalProperties` only where the signature
   holds nothing else: no kept property, no `patternProperties`, and no `allOf` / `anyOf` /
   `oneOf` next to it (a member may add a signature or an inherited discriminator). Elsewhere the
   walk stops and the target is typed in place (point 3 above), as is a pattern, which has no
   index of its own.

## Amendment (2026-11-11): owners the shape model left opaque

The pointer rule of the amendment above held only for owners `generatedMember` modelled. Three
shapes were opaque, and `originalIndexFails` counts opaque as compiling, so their original pointer
stayed, read through a signature of another type or not compiling (TS2339):

1. **Several value schemas** (`additionalProperties` next to a pattern, or two patterns). The
   signature is their union, which is no one value schema's type: the member is `isOtherType`, as
   next to kept properties. This is the same document-level rule; where every value schema has
   one type the corrected type is that type written inline.
2. **A `discriminator` owner.** The discriminator scan may add or change the discriminator's own
   property, so that key and the owner's properties stay opaque. Any other key (its
   `additionalProperties`, a property `--exclude-deprecated` left out) reads the index signature
   as without the discriminator.
3. **`$defs`.** It is a member of its own (`defsMember`), and the original reads it through
   `NonNullable` (`indexKeyword`): a `names` member whose definitions are present, so the walk
   reads on into them (`Inner/additionalProperties`). A name the map does not have fails, as does
   a `$Read<T>` / `$Write<T>` definition with more segments after it.

`generatedMember` grew past the file limit, so the index signature member moved to
`index-signature-member.ts`; the Consequences above apply to it too.

## Amendment (2026-11-12): discriminator owners and `unevaluatedProperties`

Two owners were still opaque, and `originalIndexFails` counts opaque as compiling, so pointers
whose original does not compile kept it (TS2339), against point 1:

1. **Properties of a `discriminator` owner.** The amendment of 2026-11-11 left every property of
   such an owner opaque, so `Pet/properties/owner/properties/name` kept
   `Pet["owner"]["name"]` (TS2339 through an optional `owner`). A discriminator owner's own type
   is an object like any other: the scan adds or changes only the discriminator's property (of
   the owner, or of a mapped member). So only that key is opaque; every other property is read
   as in an object without a discriminator.
2. **`unevaluatedProperties`.** Any key of an owner with the keyword was opaque, with or without
   its fix. The walk now knows whether the type has the keyword (`unevaluatedSchemaOf`, the same
   test the `unevaluated-properties` fix uses):
   - With the fix, the type is the other keywords' type intersected with an index signature
     (`unevaluatedIndexMember`), or the signature alone. A key the other keywords miss reads the
     signature, which holds the declared property types too (`isWidenedRecordValue`): it is
     `isOtherType`, as next to `additionalProperties`, so the pointer gets the target's type. A
     property the other keywords declare is read alone.
   - Without the fix, or next to `additionalProperties` (where it does not apply), the type does
     not have the keyword: its key is missing. The original then reads another member or the
     `never` of `Record<string, never>`, neither the target. `false` stays as it was: the original
     reads `never` there, which is its type.

`generated-shape.ts` grew past the file limit, so the schema shape tests (`isObjectShape`,
`isArrayShape`, `hasObjectKeywords`) moved to `schema-shape.ts`; the Consequences apply to it too.

## Amendment (2026-11-12): own properties next to `anyOf` / `oneOf`

A schema with `properties` and `anyOf` or `oneOf` (the usual discriminator owner) was still
opaque for every key, so `Pet/properties/owner/properties/name` kept `Pet["owner"]["name"]`
(TS2339 through an optional `owner`), against point 1. The walk now reads how the generator joins
the own keywords and `allOf` items (the base) with the variants (`variantsFormOf`, mirroring
`variantsType`):

- `Base & (A | B)`: `oneOf` with a variant that is surely no primitive (a whole component, an
  object or an array), and `anyOf` with `anyof-properties`. TypeScript reads it as
  `(Base & A) | (Base & B)`: where no variant has the key, it is the base's member; where a joined
  member is an optional property, the key may be `undefined`; else opaque.
- `Base | A | B`: `anyOf` without that fix, and `oneOf` of plain primitives. A key is missing if
  the base or a variant misses it.
- Any other form (both keywords, a `type` list, the `WithRequired` variants of
  `anyof-oneof-required`) stays opaque.

An intersection of parts that each declare the key as an optional property (`allOf` items, or a
variant that repeats the base's property) may be `undefined` too, so a pointer that goes on
through it is rewritten.

The typed walk indexed a property of such a base even where the type is a union whose variant
misses it, which does not compile either (also with `ref-pointers`). It now types such a target in
place (`isMissingComposedKey`), as it does for a left-out property.

`generated-shape.ts` grew past the file limit, so the member type and the way parts join moved
to `generated-member.ts`, and the composition parts to `variants-form.ts`.

## Amendment (2026-11-13): variants without a type of their own

The amendment above read `oneOf` as `Base & (A | B)` only where a variant is surely composite (a
component, an object with object keywords, an array), and every shape under
`anyof-oneof-required` as opaque. So the commonest shape of all, "one of these fields is
required" (`oneOf: [{ required: [email] }, { required: [phone] }]`), and variants that are only
`{ type: object }` (with a `title`, say) kept `Contact["owner"]["name"]` (TS2339 through an
optional `owner`), with and without the fix. The walk now reads what the generator emits for them:

1. **A variant with no type of its own.** A variant with no `type` or `type: object`, and no
   keyword that types it otherwise (`$ref`, `const`, `enum`, `allOf` / `anyOf` / `oneOf`), is
   `unknown` or `Record<string, never>`, neither a primitive keyword (`isPrimitiveType`), so
   `oneOfType` writes `Base & (A | B)`: the form is `intersection`. A key of `unknown` is missing.
2. **`Record<string, never>`** is now its own member kind, `never`, not `opaque`: alone it
   compiles for every key and every key after it, as before. In an intersection, TypeScript reads
   a key that a part declares (a property or `$defs`) from the declaring parts alone; the index
   signatures of the other parts (this one and `additionalProperties`) take no part in it. So
   `{ owner?: O } & Record<string, never>` reads `owner` as `O | undefined`.
3. **`anyof-oneof-required`.** Where the fix applies (`hasRequiredVariants`: an object schema
   whose variants each require only properties it keeps), the type is
   `WithRequired<Base, "a"> | WithRequired<Base, "b">`. The form `required` carries the key lists:
   a key reads the base's member, required where every variant requires it (`-?` drops
   `undefined`), optional otherwise. Where the fix does not apply, the variants read as without
   it.

## Amendment (2026-11-13): unions of `never` members and type lists

The amendment above made `Record<string, never>` a member of its own, but only an intersection
joined it. A union of such variants stayed opaque, and `originalIndexFails` counts opaque as
compiling, so the pointer kept `Contact["owner"]["name"]` (TS2339 through an optional `owner`):
`anyOf` of `{ type: object }` variants next to `properties` (`Props | Record<string, never>`),
such variants in a `oneOf` inside an `allOf` item, and a `discriminator` owner with them. A
pointer through `allOf/0` next to them printed `Contact["allOf"]["0"]["owner"]["name"]`, which
compiles but is `never`.

1. **A key of a union** (`unionMember`) is missing if one member misses it. A `never` member adds
   nothing (`never | T` is `T`), so the key reads as the other members have it, and as `never`
   only where every member is such a record. Several other members give an optional property
   where one of them is one (the union may be `undefined`), else opaque. It reads `anyOf` /
   `oneOf` alone, the `Base | A | B` form, and `Base & (A | B)` as `(Base & A) | (Base & B)`,
   which is the union of the joined members: a joined member that misses the key now makes it
   missing, where it was opaque. Both keywords without a base stay as they were.
2. **`never` is no target's type.** It compiles for every key after it but admits no value, so
   the original through a `never` member is wrong output and is corrected by default, as one read
   through an index signature of another type (the amendment of 2026-11-10). The one exception is
   a `false` target at the last segment (`unevaluatedProperties: false`,
   `additionalProperties: false` of such an owner): the target is `never` too, so it stays.
3. **A type list with one type besides `null`** (`type: [object, "null"]`). The generator types the
   `anyOf` / `oneOf` variants on the listed type's member (`multipleTypes`) and adds `null` next
   to it, so the typed walk, which reads the type through `NonNullable`, reads such variants as for
   `type: object` (`withVariantsOfListedType`); before, every type list was `unknown`, so a union
   whose variant misses the key kept `NonNullable<NonNullable<Contact>["owner"]>["name"]` (TS2339),
   also with `ref-pointers`. A list without variants reads as before: its nullable own part counts
   as missing, as for `nullable: true`, which types the target in place. That is the target's
   type too, and changing it would change output that compiles.

Measured: the generator fuzz of `$ref` pointers next to compositions (4428 documents, strict
`tsc`) fails on 125 fewer documents (306 before, 181 after; the rest are contradictory schemas,
such as an `allOf` of an object and a string) and changes no document that compiled; the 1806
documents of the compat corpus give the same output over seven option sets.

## Amendment (2026-11-14): a type list of one type

Point 3 of the amendment above read the variants of `type: [object, "null"]` as for `type: object`
only on the typed walk's path (`isMissingComposedKey`). The check whether the original pointer
compiles (`originalIndexFails`, through `generatedMember`) still read every type list as
`unknown`, so a list of one type without `null` (`type: [object]` with `properties` and
`anyOf: [A, B]`) kept `components["schemas"]["Contact"]["owner"]["name"]`, which does not compile
(TS2339: `A` has no `owner`); with `ref-pointers` it was already `string`.

`multipleTypes` types each listed type as the schema with that type alone, so a list of one type
is that type's schema, and a list of one type and `null` adds `null` to it. The member reading
(`memberAt`) now reads a list of one type as that type (`withVariantsOfListedType`), after a
nullable schema has been read as `T | null`. The rule covers every type, not only `object`:
`[string]` and `[array]` are typed as `string` and `array` too, so their pointers now get the
output that the same schema with `type: string` or `type: array` gets, under the rules above (a
pointer that does not compile, or reads `never` or another type's index signature, is typed
in place; any other pointer stays).

Measured: the shape sweep of `$ref`s next to variants (252 documents) fails on none, against 18
(every `type: [object]` shape without `--fix`), and changes no other document. The pointer fuzz
with one-type lists (400 documents, OpenAPI 3.1 and 3.0) fails on 92 and 99 documents, against 134
and 148, and on no document that compiled before. In the documents that compiled before, every
changed pointer read `never` (7, now typed in place as `never`) or a type other than its target's
(74, of which 49 now have the target's type). With `ref-pointers` one document changes (it did
not compile before); with `all` none. The 1806 documents of the compat corpus give the same
output over ten option sets.

## Amendment (2026-11-15): literal owners, `not` and `$defs`

`generatedMember` read a schema with `enum`, `const` or `not` as opaque, so `originalIndexFails`
counted every pointer through one as compiling. The generator types an `enum` or `const` schema
as a literal union (or an `--enum` enum), which has no member such as `schema`, `oneOf` or
`allOf`, so these pointers kept an original that does not compile (TS2339): the `schema` of an
enum parameter or header, a `const` variant of a `oneOf`, an `enum` item of an `allOf`. The typed
walk also read a `$defs` entry of a schema whose type has no `$defs` member (an enum, an array) as
if it had one.

1. **A literal owner** (`const`, or a schema the enum rule types) has the members of its values:
   a key one of its primitive values lacks is missing; a built-in member of all of them (`length`
   of strings) is opaque, as is any key of an object or array literal. A `null` value is left out,
   since the `nullable-enums` fix may drop it: it never makes a key missing.
2. **`not`** adds nothing to the type, so the other keywords of its schema are read as without it.
3. **`$defs`** is followed by the walk only where the owner's type has a `$defs` member; elsewhere
   the pointer is typed in place.
4. Only a `$ref` left after following one (a cycle of `$ref`s) stays opaque.

Changes from rc.12: these pointers, which did not compile, now get their target's type. A pointer
that compiled keeps its type.

Measured: the pointer fuzz (400 documents, six option sets) fails on 1 to 2 fewer documents per
set, and on no document that compiled before. The compat corpus (1806 documents, nine option
sets) gives the same output.

## Amendment (2026-11-15): record unions, tuple rest items, empty enums

Opaque means "the walk cannot tell", and `originalIndexFails` keeps the original pointer there,
as ADR-021 asks of output that may compile. Three shapes were opaque although the walk can tell:

1. **A union of records.** `unionMember` read an `anyOf` / `oneOf` whose typed members are
   several records as opaque, so `Mixed/oneOf/1/additionalProperties` kept
   `Mixed["additionalProperties"]`, which reads the union of every member's value type. Several
   distinct typed members with an index member are now `isOtherType`: the corrected type is the
   one variant's value, written inline. One record (`Numbers/additionalProperties`) keeps its
   original.
2. **The rest items of a tuple.** `[number]` of a `prefixItems` tuple is the union of its elements
   and its rest items, so a `$ref` to `Tuple/items` (and deeper) did not name the target's type.
   Where the owner has tuple elements (`prefixItems`, or an `items` array) the `items` step stops
   and the target is typed in place. A plain array keeps `[number]`.
3. **Empty and null-only enums.** An `enum: []` is typed `never` (or an empty `--enum` enum), an
   `enum: [null]` is `null`; neither has members. Their keys are missing now, and the walk does
   not follow `$defs` through a `never` member, so such pointers are typed in place.

4. **Nullable owners.** A nullable schema (`nullable: true`, a `type` list with `null`) that is no
   object or array schema was opaque, as its type might have been `unknown`. With
   `strictNullChecks` no key of `T | null` compiles whatever `T` is, and `unknown` has no keys
   either, so every key of a nullable owner is missing: a `$ref` through a nullable `allOf`, a
   nullable `anyOf`, a nullable schema without a type or a `type: [string, "null"]` is typed in
   place. No option drops the `null`.
5. **Positions of an array.** `X[]["0"]` is an item, as `[number]` reads it; it was opaque, so
   `Pet/allOf/0/additionalProperties/items` (one `allOf` item whose index signature is an array)
   kept an original that reads a key of the enum item. A position of a tuple stays opaque: with
   `--array-length` one past its end has no element.
6. **Depth.** The walk stopped after eight levels of `allOf` / `anyOf` / `oneOf` and read deeper
   shapes as opaque, so a `$ref` through ten nested `allOf` items kept an original that does not
   compile. The limit only guarded against `$ref` cycles; the walk now keeps the schemas it is
   reading and reads one met again as opaque, so finite nesting is read to any depth.

What stays opaque, and why the original compiles there: a cycle of `$ref`s (the original reads
the cycle as TypeScript does: `NonNullable<Ring["next"]>["name"]`); the discriminator's own key
(the discriminator scan may change it); built-in members of literals and arrays (`length`) and
keys of object or array literals, which TypeScript reads as members of their type; a property
that several parts of an intersection declare (the original reads their intersection: the
target's type where the parts agree, fewer values where they do not, as an own enum next to a
`oneOf` variant's enum of the same name; telling these apart needs the type proof the walk does
not run); a position of a tuple; and `Blob` bodies, whose members are the DOM library's.
`test/api/ref-pointer-opaque-shapes.test.ts` shows for each that the default output compiles.
Each is a type the generator writes after the walk, so keeping the original is the safe choice.

Changes from rc.13: these pointers, whose original reads another type or does not compile, get
their target's type. Measured: the pointer fuzz (400 documents, five option sets) fails on no
document that compiled before; with the defaults and with `--enum` 20 of 264 error messages, with
`ref-pointers` 15 of 113, are gone.
The compat corpus (1806 documents, ten option sets, against rc.13) gives the same
pointers in every document.

## Amendment (2026-11-15): redeclared properties and pointers checked against the written types

Two gaps were left after the amendments above. The opaque list above kept the original for a
property that several parts of an intersection declare; and the walk reads only the shapes it
models, so owners outside them (an object with a `oneOf` of strings, which is typed
`string | { … }`; `anyOf` next to `oneOf`; a `type` list; a `oneOf` of `null`) kept originals that
do not compile (TS2339, TS2536).

1. **Redeclared keys** (`redeclared-key.ts`). A property of a composed owner that one of its
   `allOf` / `anyOf` / `oneOf` parts declares too is read by the original through the join of
   both declarations: `"a" | "c"` next to a variant's `"a"` reads `"a"`, an object next to an
   empty object reads more keys or none. The key is now missing, both in the typed walk and in
   the original's steps, so the pointer is typed in place. It is not missing where the part reads
   the same type: the part's member is absent, an index signature or `never`; or its schema is the
   same JSON; or both are primitives (`string`, `number`, `integer`, `boolean`) of one `type`
   whose part schema only has notes (`description`, `format`, `maxLength`, `pattern`, …), which
   do not change the type. A part the walk cannot read counts as redeclaring: keeping the original
   there would rest on a guess. This replaces the "property that several parts of an intersection
   declare" item of the opaque list above.
2. **Checked pointers** (`ref-pointer-passes.ts`, `pointer-checks.ts`). Where the document has a
   schema `$ref` with segments past its component, the generator first runs a scratch pass with
   the pointers as the rules above write them, then evaluates each written pointer type with the
   footer's `TypeEvaluator` (ADR-027) over that pass's declarations. A type the evaluator reads as
   `missing` surely does not compile; in the real pass those `$ref`s are typed in place. A type it
   cannot read (opaque) keeps its pointer, as ADR-021 asks of output that may compile. One scratch
   pass is enough: typing a `$ref` in place makes no other pointer missing, since a pointer reads
   the owner's type, which does not change. A document without such `$ref`s runs one pass, as
   before. The check runs with and without `ref-pointers`, since a pointer that does not compile
   is wrong output either way.
3. **The evaluator outside `FlattenedDeepRequired`.** The check reads the types as TypeScript
   does, so the evaluator's shallow mode now follows its rules: nested intersections are one list
   of parts; parts of different primitives (`string & number`, `"a" & number`) are `never`; an
   intersection with a nullish part is nullish for `NonNullable`; an optional property reads
   `T | undefined`, so a key through it is missing; `Omit` of a union with `null` is `{}`; and
   `WithRequired<T, "k">` reads `k` as `NonNullable<T["k"]>`. A non-literal key or a non-object
   `T` leaves `WithRequired` unchanged.
4. Two cases moved with the check: a `$ref` through a media type named `content` (the header
   parameter test) is now typed in place, as its original did not compile; and the
   discriminator's own key next to a `oneOf` of strings gets `string` in place. A
   discriminator with only a mapping keeps its pointer.

Changes from rc.13: pointers whose original reads fewer values or does not compile get their
target's type, by default and with `--fix ref-pointers` / `--fix all`. A pointer that compiled and
read its target keeps its type.

Measured: the pointer fuzz (400 documents, five option sets) now fails on no document in any
set, against 74 (defaults), 74 (`--enum`), 44 (`ref-pointers`), 12 (`all`) and 45 (OpenAPI 3.0)
with rc.13; its pointers that read `never` or another type than the target drop by 23 to 32
percent. The two-declaration fuzz (600 documents) and the enum fuzz compile with no error.
The compat corpus (1806 documents, ten option sets, against rc.13) changes three documents.
gerermesaffaires (1 error) and sinao (12 errors) now compile with `--enum-values`. With
`--enum-values`, apple sirikit-cloud-media writes its `class` and `method` arrays with their
literal types instead of pointers: `Intent`, their `allOf` part, declares `class` as its
discriminator, which the walk reads as opaque. Both types compile and read the same values.
