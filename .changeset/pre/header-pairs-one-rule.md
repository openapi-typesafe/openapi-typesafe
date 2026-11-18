---
"openapi-typesafe-fetch": patch
---

Headers given as pairs (an array, a `Set`, `map.entries()` or a generator) follow the same rule as
a record or a `Map`: `null` removes the header, `undefined` sends nothing and an array value appends
each item (`1, 2`). Before, pairs sent `null` as the text `"null"` and joined an array as `1,2`. An
iterator used as one of the pairs is now sent too, also with a request body.
