---
"openapi-typesafe": patch
---

New opt-in fix `prefix-items` (`--fix prefix-items`): a `prefixItems` tuple follows JSON Schema
2020-12. It is open unless `items` or `unevaluatedItems` is `false`, further items get the `items`
type, and elements after `minItems` are optional (openapi-typescript #1892).
