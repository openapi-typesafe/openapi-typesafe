---
"openapi-typesafe": patch
---

A schema source nested deeper than the call stack now fails with `SCHEMA_TOO_DEEP` on Node.js 22
and 24 too. Before, parsing it threw a raw `RangeError` there.
