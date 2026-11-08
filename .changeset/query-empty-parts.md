---
"openapi-typesafe-fetch": patch
---

A query parameter that serializes to nothing (an empty array or object, `null`) no longer leaves a
stray `&` (`a=1&&b=2`), and exploded arrays and objects leave out their `null` and `undefined`
items (audit finding F7, ADR-041).
