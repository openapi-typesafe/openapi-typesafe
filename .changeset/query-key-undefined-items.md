---
"openapi-typesafe-react-query": patch
---

An `undefined` item in a parameter array (`[1, undefined]`) has a query key of its own, apart
from `[1, null]`, which a `qs` serializer sends differently. Keys with such an item, also in a
body, now stay the same after `dehydrate` and `hydrate`, so filters still find their queries.
