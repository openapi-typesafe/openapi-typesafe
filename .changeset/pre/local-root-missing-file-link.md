---
"openapi-typesafe": patch
---

With `--local-ref-root` reached through a symbolic link (macOS `/tmp` is one), a `$ref` to a
missing file inside the root was refused with `SCHEMA_REF_FORBIDDEN` as if it were outside.
It is now reported as an unresolved `$ref`, like any missing file.
