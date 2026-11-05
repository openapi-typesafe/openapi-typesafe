# ADR-028: `--path-params-as-types` overlaps move a template only on a proven error

- Status: Accepted
- Date: 2026-11-05

## Context

With `--path-params-as-types`, a template key such as `` `/a/${string}` `` also matches `/a/b` and
`` `/a/${string}/b` ``. TypeScript checks each key it matches against the template's type, and
the output does not compile when one does not fit (TS2411, TS2413, upstream #1752). Since rc.0 the
generator writes such a template in an object of its own, in a `paths` intersection.

The rc.1 audit found two ways this changed output that compiles, against ADR-021:

- The assignability check had two answers, "proven assignable" and "not proven". A type it does
  not model (`Record<string, never>`, raw text) was "not proven", so the template moved although
  TypeScript accepts the pair.
- The cover check matched keys by trying every split of the text (backtracking). TypeScript matches
  each text of the template at its first occurrence and does not backtrack:
  `` `/a/b/${number}` `` is not assignable to `` `/${string}/${number}` ``, so TypeScript checks
  nothing there, while the generator moved the template.

## Decision

1. **Three answers.** The check answers `assignable`, `rejected` or `undecided`. `rejected` is
   given only where TypeScript surely reports an error (`strict`, without
   `exactOptionalPropertyTypes`); a pair it does not model is `undecided`.
2. **Move only on `rejected`.** A template moves when TypeScript checks a key against it (the
   checker's own matching, `template-key-match.ts`) and that key's path item is `rejected`, or when
   it repeats another template (TS2374). An `undecided` pair keeps the original output. A
   template of only `${boolean}` placeholders is no signature (TS1337), so the checker neither
   checks it nor checks a key against it, and neither does the generator.
3. **One check.** The presence check of rc.0 (methods, parameter locations, required properties)
   and its backtracking cover are removed; the three-valued check covers what it proved.

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| Move only on a proven error (chosen) | Output that compiles is the same as upstream's | Some output upstream cannot compile stays as it was, where the check cannot read a type |
| Move unless proven assignable (rc.0) | Every output compiles | Changes output that compiles, against ADR-021 |
| Run the TypeScript checker on the output | Exact | A TypeScript dependency and a second pass at generation time |

## Consequences

A document whose covered path types the check cannot read (utility types, callback output) keeps
the original output, which may not compile. The check can grow to model more types without any
change to output that compiles.

## Review trigger

A corpus document whose upstream output fails with TS2411 or TS2413 and stays failing, where the
missing rule is one TypeScript applies to the types the generator writes.
