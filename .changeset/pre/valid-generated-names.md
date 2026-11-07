---
"openapi-typesafe": patch
---

Generated names always compile: `--root-types` aliases that clash with an enum, a helper or a used
global type get a number, invalid characters and reserved words are handled, and
`--make-paths-enum` names are unique (upstream [#2099](https://github.com/openapi-ts/openapi-typescript/issues/2099), [#2341](https://github.com/openapi-ts/openapi-typescript/issues/2341), [#2206](https://github.com/openapi-ts/openapi-typescript/issues/2206)).
