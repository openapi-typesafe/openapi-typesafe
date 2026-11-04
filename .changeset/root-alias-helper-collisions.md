---
"openapi-typesafe": patch
---

`--root-types`: a root alias whose name a helper type of the file also declares (a schema named
`WithRequired` with `--root-types-no-schema-prefix`) is renamed to `WithRequired_2`, as aliases that
an enum takes already are. Before, both were declared under one name, which does not compile.
