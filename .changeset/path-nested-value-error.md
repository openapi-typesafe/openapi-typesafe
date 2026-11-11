---
"openapi-typesafe-fetch": patch
---

A nested array or object in a path parameter (`{ id: [[1]] }`) now fails with an error that names
`pathSerializer()`, the option that sends such values. It told you to write a `querySerializer()`,
which does not apply to the path.
