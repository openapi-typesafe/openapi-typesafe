---
"openapi-typesafe": patch
---

A `$ref` to one pattern of `patternProperties`
(`#/components/schemas/Labels/patternProperties/^label_`) compiles without `--fix`: it is typed as
that pattern's schema instead of `components["schemas"]["Labels"]["patternProperties"]["^label_"]`
(TS2339).
