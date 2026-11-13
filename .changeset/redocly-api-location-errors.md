---
"openapi-typesafe": patch
---

With several APIs in `redocly.yaml`, a `root` that is not a valid URL now fails with a line that
starts with `API <name>:`, as other failures of an API do. A `local-ref-root` that is not a valid
URL fails that API with `CLI_CONFIG_INVALID`, and `--local-ref-root` with `CLI_FLAG_INVALID`
naming the flag, as their other bad values do; both failed with a `CLI_LOCATION_INVALID` that
named neither.
