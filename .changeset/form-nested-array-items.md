---
"openapi-typesafe-fetch": patch
---

An object or an array as an item of an array field in an `application/x-www-form-urlencoded` body
throws and names `bodySerializer()`, as a nested object field already did.
`{ tags: [{ id: 1 }] }` was sent as `tags=[object Object]`, and `[[1, 2], [3]]` was flattened to
`1,2,3`.
