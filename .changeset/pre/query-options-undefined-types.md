---
"openapi-typesafe-fetch": patch
---

Every `querySerializer` option accepts `undefined` in its type, so a wrapper that passes its own
optional option on (`{ array: { explode: options.explode } }`) compiles with
`exactOptionalPropertyTypes`.
