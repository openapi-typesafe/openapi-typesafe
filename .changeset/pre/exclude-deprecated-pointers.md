---
"openapi-typesafe": patch
---

With `--exclude-deprecated`, a `$ref` to a property it leaves out
(`#/components/schemas/A/properties/old`) is typed as that property's schema, instead of naming a
key the type no longer has. The same holds for a `$ref` into a deprecated operation or response
header, and a `$ref` through another `$ref` (`Wrap/properties/o/properties/v`, where `o` is a
`$ref`) no longer warns `REF_NOT_FOUND`. With `--make-paths-enum`, `ApiPaths` lists only the
operations that `paths` keeps.
