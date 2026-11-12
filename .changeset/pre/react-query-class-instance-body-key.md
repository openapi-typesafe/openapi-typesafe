---
"openapi-typesafe-react-query": patch
---

A body that is not an object literal, such as an instance of a form class, an object made with
`Object.create` or one from another realm, is now part of the query key by the members the fetch
client sends, with a `File` in it by its type, size and name. Before, such a multipart body held
every file as `{}`, so a query for a second file showed the cached result of the first.
