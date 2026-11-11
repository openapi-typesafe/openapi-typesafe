# ADR-027: Checked `--enum-values` types, discriminator value warnings, required-only variants

- Status: Accepted
- Date: 2026-11-04

## Context

The full-corpus check of 1.0.0-rc.1 left about 27 documents whose `--enum-values` output does not
compile, for several reasons:

| Cause | Example | Our bug? |
| --- | --- | --- |
| The array type indexes a key the generated type does not have (`definitions`, `allOf/3`, `items`, an operation's `parameters/0`) | codat, dnd5e, enode | yes |
| A property of a schema whose type is `unknown`: `anyOf: [{ required: [a] }]` next to `properties` gives `Props \| unknown` | 22 GitHub documents, rudder | yes (the array) |
| An `anyOf` member that is an array of the enum next to a member that is not: the location drops the member, the union is not an array | stripe, here.com | yes |
| An `allOf` of enums with different values: the type is their intersection | GitHub discussion state, nexmo, motaword | no: the document |
| A discriminator value that the member's property enum does not list: the generated property is `never` | spotify, bitbucket, openai | no: the document |
| Objects that cannot meet: `type: null` with object variants, `allOf` items with different required enums | vercel, sendgrid | no: the document |

The array type is the location of its schema (`FlattenedDeepRequired<components>["schemas"]["A"]["b"]`),
as upstream writes it, and where it compiles it must not change (ADR-021).

## Decision

1. **Check each array against the generated types.** After the document is transformed, a small
   evaluator (`type-evaluation.ts`) reads the array's location type the way TypeScript does, over
   the generated declarations and helper types. Its answers are sure: a key is missing only where
   TypeScript reports it, a value is excluded only where the type is made of other literals, and
   every type it does not model counts as holding the values. It follows these TypeScript rules,
   because the corpus needs them:
   - `Extract<T, { k: unknown }>` keeps only members with a written, required `k`; an index
     signature does not count. With no such member the location types nothing.
   - `Omit<T, K>` drops the keys `K`, and over a type with a string index signature keeps only
     the index signatures (`keyof T` is then all strings).
   - An intersection is `never` where `null` or `undefined` meets an object, or where objects
     share a property whose literal types have no value in common and one of them requires it
     (`{ a: "x" } & { a: "y" }`).
   - Unions of intersections are distributed, as TypeScript normalizes them. A union with an
     `unknown` member is `unknown` (`{ a: X } | unknown | { m: Y }`), with an `any` member `any`,
     so `Extract` over it finds no member.
   - `$Read<T>` and `$Write<T>` (`--read-write-markers`) are the objects `{ readonly $read: T }`
     and `{ readonly $write: T }`; they hold no enum value.
   - Where one part of an intersection declares a property, the index signatures of the other
     parts do not take part in its type (`{ a: X } & { [key: string]: Y }` gives `X` for `a`).
   The expansion budget counts references only, so the checks after a large evaluation still run.
2. **Where the location type surely fails, the array is typed by its own values**
   (`ReadonlyArray<"a" | "b">`). That is the default: the original does not compile there. Every
   other array keeps its type, byte for byte. An empty enum is typed `never`, and the
   `ReadonlyArray` helper of `never` is `never` too (`never` extends an array), which not even
   `[]` is; its array is `readonly never[]`.
3. **A schema that admits none or only some of its own values** (an `allOf` of different enums,
   a discriminator value the enum does not list) gets the same array, all of its values listed,
   and a warning that names the array and the excluded values. We list the schema's own values,
   not the intersection: the array documents the enum as written, and an empty array would hide
   the contradiction in code that reads it.
4. **Discriminator values.** Every Discriminator Object member whose value (mapping key, or the
   schema name without one) its own property `enum` / `const` does not allow gets a typed warning
   (`findDiscriminatorValueConflicts`), naming the rule and the mapping entry to add. The output
   does not change: the value the generator adds is what the rule gives. A member that inherits
   through an `allOf` chain counts too, up to a schema with its own discriminator of the property.
5. **Required-only variants** (`anyOf` / `oneOf: [{ required: [a] }, …]` next to `properties`):
   the original type compiles (as `unknown`), so the corrected type
   `WithRequired<Props, "a"> | …` is the opt-in fix `anyof-oneof-required` (ADR-021).
6. **TS2502 of a recursive JSON value schema stays documented** (docs/advanced.md, Limits). A clean
   fix declares each schema of such a cycle as a named type alias and writes every `$ref` inside
   the cycle with that name; that changes where the type of a `components` member is declared and
   adds exported names, for every user of those schemas. It is an output design change for 2.0
   (with `--root-types`), not a fix of 1.x output.

## Alternatives

| Option | Pro | Con |
| --- | --- | --- |
| Evaluate the generated types (chosen) | One rule for every cause; output that compiles stays | An evaluator that must follow the helper types the generator writes |
| Simulate each cause on the document | No evaluator | One walk per cause, and new causes slip through |
| Type every array by its values | Simple, always compiles | Changes every array, also the compiling ones (ADR-021) |
| Run the TypeScript checker | Exact | Far too slow, and TypeScript is only a peer dependency |
| List only the admitted values | The array matches its location | Hides the contradiction; an empty array of a non-empty enum |

## Consequences

- A helper type the generator adds later must be taught to the evaluator, or arrays through it are
  never retyped (safe: they stay as they are).
- The parity property tests skip outputs with a retyped array (`hasRetypedEnumValues`), the same
  way as the other default fixes of output that did not compile.

## Amendment (2026-11-11): index signatures by key type

With `--path-params-as-types` a templated path is an index signature of `paths`
(`` [path: `/orders/${number}`] ``). The evaluator read any key that names no property through the
first index signature of the object, so `FlattenedDeepRequired<paths>["/orders/{id}"]` read
`/users/${number}` when that path came first, and an enum of `/orders/{id}` counted as excluded:
a false `ENUM_VALUES_EXCLUDED` warning, and an array typed by its values, depending on the order
of the paths. The check also ran before the location was rewritten to the template, so it did not
check the type the output has.

1. **The check reads the output.** The `paths["<url>"]` references are indexed by their template
   before the check, so it evaluates exactly the location the array is written with.
2. **A key reads the signatures TypeScript picks** (`findApplicableIndexInfo`): a literal key its
   property; otherwise every signature whose key type admits the key, intersected; a `string`
   signature only where no other one applies; `T[A | B]` is `T[A] | T[B]`. The key types of the
   raw template keys the generator writes come from the document's paths (`templateKeyTypes`), and
   the match is the checker's own (`isAssignableToTemplate`). A signature or raw key of a type the
   generator does not write for a path is opaque, so it never counts as an error.
3. **A record value whose index signature holds other types.** Since rc.5 the index signature next
   to `properties` also holds their types (`withPropertyTypes`), and next to `patternProperties`
   it always held the patterns' types, so `Stats[string]` of an `additionalProperties` enum read
   `"x" | "y" | number`: the location admits the values, the check kept it, and the array accepted
   `5`. Where the signature surely holds more than the value (`isWidenedIndex`, the same rule the
   `$ref` pointer walk uses, ADR-026), the array is typed by its own values; the rule reads the
   document, so a property type the signature admits already counts too, which writes the same
   type differently. Next to `allOf` / `anyOf` / `oneOf` the `[string]` location stays: it compiles
   and is not surely another type. The `unevaluatedProperties` value of the
   `unevaluated-properties` fix follows the same rule (`isWidenedRecordValue`), and its signature
   also holds the declared types of `allOf` / `anyOf` / `oneOf` members, so next to those its
   array is typed by its values too.
