---
"openapi-typesafe": patch
---

`--fix=root-type-numbering`: with `--root-types --root-types-no-schema-prefix`, schemas named
`record` and `Record` gave `Record_2` to `record`, although without the fix `Record_2` is the alias
of `Record` (the name `Record` itself shadows the global type the output uses). The earlier schemas
are now numbered after the shared name got its own, so `Record_2` keeps its schema and the fix
only adds `Record_3`, as the docs promise.
