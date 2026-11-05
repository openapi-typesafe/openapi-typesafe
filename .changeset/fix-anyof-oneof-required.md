---
"openapi-typesafe": patch
---

New opt-in fix `anyof-oneof-required` (`--fix anyof-oneof-required`): an `anyOf` or `oneOf` whose
variants have only `required` keys of the sibling `properties` gives the parent with each variant's
keys required (`WithRequired<Props, "a"> | WithRequired<Props, "b">`) instead of `Props | unknown`,
which is `unknown`. A key whose property `--exclude-deprecated` leaves out keeps the old output.
