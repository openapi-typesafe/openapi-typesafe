---
"openapi-typesafe": patch
---

A local `$ref` root that is a file is now refused also when it is written with a trailing slash (`--local-ref-root file:api.yaml/`, `localRefRoot: new URL("api.yaml/", base)`, `local-ref-root: "file:../specs/api.yaml/"`) or names a path below a file (`api.yaml/specs/`). It fails with `CLI_FLAG_INVALID`, `CLI_CONFIG_INVALID` or `OPTION_INVALID` before anything loads, instead of refusing every local `$ref` as outside the root.
