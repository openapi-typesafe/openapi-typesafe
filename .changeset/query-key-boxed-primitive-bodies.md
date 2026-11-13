---
"openapi-typesafe-react-query": patch
---

A `Number`, `Boolean` or `String` object in a body (`new Number(1)`), as the whole body or inside
it, also from another realm, is keyed by its value again, as JSON sends it. Such bodies with
different values had the same query key (`{}`), so a second query showed the first one's data.
