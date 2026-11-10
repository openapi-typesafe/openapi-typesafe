---
"openapi-typesafe": patch
---

With `--exclude-deprecated`, a `$ref` to a property it leaves out
(`#/components/schemas/A/properties/old`) is typed as that property's schema, instead of naming a
key the type no longer has; and with `--make-paths-enum`, `ApiPaths` lists only the operations
that `paths` keeps.
