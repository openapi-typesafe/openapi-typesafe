---
"openapi-typesafe-fetch": patch
"openapi-typesafe": patch
---

`Readable` and `Writable` find the `$Read` and `$Write` properties of an object with an index
signature (`additionalProperties`). The keys were read through the index signature, so no
property was marked: a request body required the `readOnly` `id`, and a response kept the
`writeOnly` password. The helper types that `--read-write-markers` writes are fixed the same way.
