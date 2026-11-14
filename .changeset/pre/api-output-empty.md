---
"openapi-typesafe": patch
---

An `x-openapi-ts.output` in `redocly.yaml` that is set but names no file (`""`, `0`, `false`) now fails
that API with `CLI_CONFIG_INVALID`, which names the API and the key. Before, it was reported as a
missing `output` key (`CLI_CONFIG_OUTPUT_MISSING`).
