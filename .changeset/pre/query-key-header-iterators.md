---
"openapi-typesafe-react-query": patch
---

Headers given as a one-shot iterator, such as `map.entries()` or a generator, are sent again by
queries. The query key read them first and used them up, so the request sent none of those
headers. The key now reads only headers it can read again (an array, a `Map`, a `Set`, `Headers`,
`URLSearchParams` or `FormData`) and leaves the others out; pass a `Headers`, a `Map` or a plain
object to have them in the key.
