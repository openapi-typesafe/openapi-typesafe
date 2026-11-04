---
"openapi-typesafe-helpers": patch
"openapi-typesafe": patch
---

`Readable` and `Writable` keep function types as they are. Before, they mapped a `Blob` or a `Date`
in response data into an object whose methods could not be called, so `data.file.arrayBuffer()`
did not type check. The helper types that `--read-write-markers` writes into the output change the
same way. See ADR-014, decision 6.
