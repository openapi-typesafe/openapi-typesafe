---
"openapi-typesafe-react-query": patch
---

A body object with a `toJSON` sent as `multipart/form-data` or `application/x-www-form-urlencoded`
now gets its own query key for each set of fields. The key held only what `toJSON` returns, while
the form body sends the object's own fields, so two uploads of different files shared one cache
entry. The key now holds the object's fields too, in `bodyFields`.
