---
"openapi-typesafe": patch
---

A schema argument is a glob pattern, which fails with `CLI_GLOB_UNSUPPORTED`, only when it is a
path with a `*` that names no file. A URL with a `*` in its query (`…/openapi?fields=*`) and an
existing file whose name has a `*` are read as any other schema.
