---
"openapi-typesafe-fetch": patch
---

`serializeArrayParam` and `serializeObjectParam` with a nested value in a path style (`simple`,
`label`, `matrix`) name `pathSerializer()` in their error, also inside your own `pathSerializer`,
instead of `querySerializer()`.
