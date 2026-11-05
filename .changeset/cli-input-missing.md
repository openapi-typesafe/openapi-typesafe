---
"openapi-typesafe": patch
---

The CLI without a schema path or URL, without `apis` in `redocly.yaml` and with nothing piped into
stdin (stdin is a terminal) now fails at once with exit code `2` and `CLI_INPUT_MISSING`. Before,
it waited for a schema typed into the terminal with no prompt, which looked like a hang
(openapi-typescript [#1905](https://github.com/openapi-ts/openapi-typescript/issues/1905)). A
schema piped into stdin is read as before.
