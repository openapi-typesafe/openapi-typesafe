# ADR-024: Discriminator fixes: one default for output that does not compile, five opt-in names

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
| #1700 | `--enum`: each member gets its own enum (`CatPetType`), not assignable to `PetType` | the added `{ enum: [Cat] }` is declared as a new TypeScript enum |

ADR-021 makes each fix of valid output opt-in in 1.x. It does not say what to do with output that
does not compile, and it lists names per roadmap step, not these.

## Decision

1. **#1665 is the default.** A `$ref` in `allOf` to a discriminated union that reaches the schema
   itself is typed with the union's own keywords, without the union. Only output that fails with
   TS2502 changes. Proof: the compat corpus (1820 documents) gives byte-identical output with
   default options, `--enum` and `--enum-values` before and after the change.
2. **The other five are one fix name each** (ADR-021 rule 2, named by construct):
   `allof-discriminated-union` (#1464, #1690), `discriminator-own-mapping` (#2200),
   `discriminator-member-required` (#2162), `discriminator-declared-value` (#2124),
   `discriminator-enum-members` (#1700). They change the output of schemas that compile today.
3. **`discriminator-values` is not extended.** It is released in rc.0; adding cases to it would
   change the output of users who list it by name, which ADR-021 rule 3 keeps for `all`.
4. **`discriminator-enum-members` needs `--enum`** (ADR-021 rule 6): without it there is no
   TypeScript enum, and naming the fix prints a notice. A member value that the owner's enum lacks
   keeps the old output.

## Alternatives

| Option | Pros | Cons |
| --- | --- | --- |
| #1665 default, five names (chosen) | Broken output compiles for everyone; valid output stays drop-in | Five more names in the `fix` list |
| #1665 behind a name too | Every change is opt-in | Users must find a name to get output that compiles; nothing to keep, since today's output fails |
| One name `discriminators` for all five | One word | Cannot take one fix without the others; each changes different valid output |
| Extend `discriminator-values` | No new names | Changes the output of a released name on update |

## Consequences

- The discriminator scan reads the fixes (`DiscriminatorScanOptions.fixes`), and the transformer
  gets the enum the scan added per member (`Discriminators.enumParentOf`).
- Accepted edges: `transform` / `postTransform` callbacks see the fixed types; under
  `discriminator-declared-value` a member whose declared values contradict a mapping keeps the
  added property; `discriminator-enum-members` uses the member names `--enum` gives (`hot_dog`,
  `typeof PetType["+"]`).
- The compat harness gets an option set per name.

## Review trigger

Upstream fixes #1665 another way, or a tester shows a schema that compiles today and changes
without a fix name. The 2.0 planning flips the five names with the rest of ADR-021.
