---
"openapi-typesafe-react-query": patch
---

A `File`, `Blob`, bytes, `FormData` or `URLSearchParams` value inside an object or array body,
such as a multipart body written as `{ image: file }`, is now part of the query key by its
content (a file by its type, size and name). Every file had the same key before, so a query for
a second file showed the cached result of the first. The key names the kinds of such values in
`bodyType`, by member name or index (`{ image: "Blob" }`).
