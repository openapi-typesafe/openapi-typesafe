---
"openapi-typesafe": patch
---

`redocly.yaml`: an API's `x-openapi-ts` block now reads `local-ref-root` and `remote-ref-hosts`
(also in camelCase), as the docs said every CLI flag works there. Each replaces the flag for that
API; `local-ref-root` is relative to `redocly.yaml`. Before, both were ignored without a message,
so a `$ref` limit set there did nothing. A key that is not an openapi-typesafe setting, such as a
misspelled flag, is still ignored but now prints the warning `CONFIG_SETTING_UNKNOWN`.
