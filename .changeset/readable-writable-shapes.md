---
"openapi-typesafe-helpers": patch
"openapi-typesafe": patch
---

`Readable` and `Writable` keep the shape of types without markers: readonly arrays stay arrays, tuples stay tuples, branded primitives (`string & { __brand }`) stay as they are, `allOf` arrays keep the properties of every member (so unions narrow again), and an optional `null` property is no longer dropped from request bodies. The `--read-write-markers` output carries the same fixed helpers (ADR-014). Fixes upstream #2615, #2620, #2632, #2717, #2765.
