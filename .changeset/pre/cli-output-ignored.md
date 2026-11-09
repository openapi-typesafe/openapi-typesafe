---
"openapi-typesafe": patch
---

`--output` together with the APIs of `redocly.yaml` warns with `CLI_OUTPUT_IGNORED`: each API is
written to its `x-openapi-ts.output`, and the `--output` path was ignored without a word.
