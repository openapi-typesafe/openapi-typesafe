---
"openapi-typesafe": patch
---

`local-ref-root: "file:"` in `redocly.yaml` now means the folder of `redocly.yaml`, as `""` does;
it named `redocly.yaml` itself, so every local `$ref` was refused. Locations in `redocly.yaml`
resolve against its folder. A local `$ref` root that is a file (`--local-ref-root api.yaml`, or
`localRefRoot` in the Node API) now fails with `CLI_FLAG_INVALID`, `CLI_CONFIG_INVALID` or
`OPTION_INVALID` before anything loads, instead of refusing every local `$ref`.
