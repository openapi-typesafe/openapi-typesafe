---
"openapi-typesafe": patch
---

A security scheme, header or other map entry named `constructor` whose value has a string `name`
now fails with `SCHEMA_KEY_UNSUPPORTED`, which names the key, instead of an untyped
`TypeError: Cannot read properties of undefined`. The schema loader (Redocly 1.x) cannot read
such an entry; rename it.
