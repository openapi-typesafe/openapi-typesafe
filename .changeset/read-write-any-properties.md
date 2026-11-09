---
"openapi-typesafe-helpers": patch
"openapi-typesafe": patch
---

`Readable` and `Writable` keep properties typed `any`, which hand-written types and transform
hooks can have. `Writable` typed them `undefined`, as openapi-typescript-helpers 0.1.0 does, so a
request body with such a property failed to compile. The helper types that `--read-write-markers`
writes into the output change the same way (ADR-014).
