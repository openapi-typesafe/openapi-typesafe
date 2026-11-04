---
"openapi-typesafe": patch
---

Fix a crash when a schema's `summary` or `title` is not a string, as when a property named `summary` is written without `properties:`. Such values no longer go into the JSDoc. Fixes upstream #2349.
