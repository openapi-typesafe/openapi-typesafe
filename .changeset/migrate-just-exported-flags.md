---
"openapi-typesafe-migrate": patch
---

Old flags in an exported justfile variable are listed as a manual step where a recipe line uses it
as a shell variable: `export FLAGS := "-it"` used as `$FLAGS`, a parameter `$OPTS="-it"` used as
`$OPTS`, and every variable with `set export`. Before, only `{{flags}}` was reported, and the
migrated recipe failed.
