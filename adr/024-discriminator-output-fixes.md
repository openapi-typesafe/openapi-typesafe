# ADR-024: Discriminator fixes: one default for output that does not compile, one name per construct

- Status: Accepted
- Date: 2026-11-04

## Context

Six upstream issues about discriminators are triaged for 1.0.0-rc.1:

| Issue | Today | Root cause |
| --- | --- | --- |
| #1665 | `Cat: { allOf: [{ $ref: Pet }] }` with `Pet: { oneOf: [Cat, Dog] }` gives TS2502 | `Omit<Pet>` in `Cat` refers to `Cat` through the union: a cycle TypeScript resolves at once |
| #1464, #1690 | `allOf` `$ref` to a union gives `Omit<A \| B, "kind">` and `kind: "Child"` | `Omit` on a union; the scan treats the schema as a member and invents its name as the value |
| #2200 | a schema's own `mapping` is lost when it also inherits a discriminator | the `allOf` pass overwrites the own discriminator, and its mapping, with the parent's |
| #2162 | `required` next to an `allOf` `$ref` to a discriminator member is dropped | the `WithRequired` check excludes every handled schema |
| #2124 | a member that requires its property with exactly its values gets a second one | the patch always adds an `allOf` item |
| #1700 | `--enum`: each member gets its own enum (`CatPetType`) or the string `"Cat"`, not assignable to `PetType` | the added value is declared as a new enum, or typed as a string literal |

ADR-021 makes each fix of valid output opt-in in 1.x, with names per schema construct (rule 2).
It does not say what to do with output that does not compile. rc.0 shipped `discriminator-values`
for one case of the member value (roadmap R12); #2200, #2124 and #1700 are other cases of the same
value.

## Decision

1. **#1665 is the default.** A `$ref` in `allOf` to a discriminated union that reaches the schema
   itself is typed with the union's own keywords, without the union. Only output that fails with
   TS2502 changes. Proof: the compat corpus (1820 documents) gives byte-identical output with
   default options and `--enum` before and after the change.
2. **Fix names are stable from the first stable release, not from a release candidate.** A name
   or output that shipped only in an `rc` may change in the next `rc`; the changeset says so.
3. **One name per construct.** The construct here is what a part of the output is about:
   - `discriminator-values`: the value a discriminator member gets. It takes R12 (one enum of
     every discriminator's values, a mapping before the schema name), #2200 (a schema's own
     mapping before an inherited one), #2124 (no second value where the member declares it) and
     #1700 (with `--enum`, a member of the owner's enum).
   - `allof-discriminated-union` (#1464, #1690): an `allOf` `$ref` to a discriminated union. It
     changes which schemas are members and how the union is reused, not the value.
   - `discriminator-member-required` (#2162): the `required` keys next to an `allOf` `$ref` to a
     member, `WithRequired`, not the value.
4. **The `--enum` part needs no notice.** `discriminator-values` changes output without `--enum`
   too, so naming it never has "no effect"; only its enum part needs `--enum`.

## Alternatives

| Option | Pros | Cons |
| --- | --- | --- |
| #1665 default, three names per construct (chosen) | Broken output compiles for everyone; one name gives the right member value; valid output stays drop-in | rc.0 users of `discriminator-values` get more changes |
| #1665 behind a name too | Every change is opt-in | Users must find a name to get output that compiles; nothing to keep, since today's output fails |
| One name per issue (`discriminator-own-mapping`, `discriminator-declared-value`, `discriminator-enum-members`) | rc.0 output of `discriminator-values` kept | Names track bugs, not constructs (against ADR-021 rule 2); a user needs four names for one correct value |
| One name `discriminators` for all | One word | Mixes three constructs; cannot take the required-keys fix without the union change |

## Consequences

- The discriminator scan reads the fixes (`DiscriminatorScanOptions.fixes`), and the transformer
  gets the owner's enum per member value (`Discriminators.enumParentOf`).
- Accepted edges: `transform` / `postTransform` callbacks see the fixed types; under
  `discriminator-values` a member whose declared values contradict a mapping keeps the added
  property; enum members use the names `--enum` gives (`hot_dog`, `typeof PetType["+"]`).
- The compat harness gets option sets per name: `discriminator-values` with `--enum` and
  `--dedupe-enums`, `discriminator-member-required` with `--properties-required-by-default`.

## Review trigger

Upstream fixes #1665 another way, or a tester shows a schema that compiles today and changes
without a fix name. 1.0.0 freezes the names. The 2.0 planning flips them with the rest of ADR-021.
