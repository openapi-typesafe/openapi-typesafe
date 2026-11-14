---
"openapi-typesafe-react-query": patch
---

A `bigint` in a parameter, a header or a form or multipart body no longer crashes the component
with "Do not know how to serialize a BigInt": the query key holds it as the text that is sent.
