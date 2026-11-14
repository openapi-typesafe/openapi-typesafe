---
"openapi-typesafe": patch
---

`openapiTS()` options that are not an object (`null`, a string, `true`, a list) now fail with
`OPTION_INVALID` instead of a plain `TypeError`. A `fix` option that is not a list, such as `null` or
`"all"`, now fails with `OPTION_INVALID` too; `fix: null` was ignored, and `fix: "all"` failed with
`OPTION_FIX_UNKNOWN`, which is now only for unknown fix names.
