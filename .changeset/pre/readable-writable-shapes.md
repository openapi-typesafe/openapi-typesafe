---
"openapi-typesafe-helpers": patch
"openapi-typesafe": patch
---

`Readable` and `Writable` keep arrays, tuples, brands, `allOf` members, optional `null` and function
types such as `Blob` methods (upstream [#2615](https://github.com/openapi-ts/openapi-typescript/issues/2615), [#2620](https://github.com/openapi-ts/openapi-typescript/issues/2620), [#2632](https://github.com/openapi-ts/openapi-typescript/issues/2632), [#2717](https://github.com/openapi-ts/openapi-typescript/issues/2717), [#2765](https://github.com/openapi-ts/openapi-typescript/issues/2765)).

They also keep properties typed `any`, which hand-written types and transform hooks can have:
`Writable` typed them `undefined`, so a request body with such a property failed to compile. The
helper types that `--read-write-markers` writes into the output change the same way.
