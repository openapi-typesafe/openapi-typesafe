---
"openapi-typesafe": patch
---

A relative `file:` URL that climbs up, such as `file:../api.yaml` or `file:..`, given as schema text
or as `localRefRoot` with an `http:` or `https:` `cwd` now fails with `SCHEMA_SOURCE_INVALID` or
`OPTION_INVALID`, like `file:api.yaml`. Before, it read `/api.yaml` or limited `$ref`s to `/specs/`
in the file system root.
