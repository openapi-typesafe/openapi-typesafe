---
"openapi-typesafe-fetch": patch
---

An object body with `Content-Type: multipart/form-data` is now sent as `FormData`: one part per
field, a `Blob` or `File` as a file part, an array as one part per item. Before, it was
JSON-encoded, so every file upload needed its own `bodySerializer`. A `Content-Type` without a
`boundary` set by hand for a `FormData` body is dropped, so the platform sets the boundary and the
server can read the parts (openapi-typescript#1214). A nested object in such a body throws and
names `bodySerializer()`. See ADR-013, decision 10.
