---
"openapi-typesafe": patch
---

A local `$ref` root that is a `file:` URL naming no local path (`file://host/specs/`) now fails
before anything loads: `localRefRoot` with `OPTION_INVALID`, `--local-ref-root` with
`CLI_FLAG_INVALID` and `local-ref-root` in `redocly.yaml` with `CLI_CONFIG_INVALID`. It used to pass
and fail later with `SCHEMA_INVALID`, and only when the document had a local `$ref`.
