---
"openapi-typesafe": patch
---

`--enum-values` with `--path-params-as-types`: an enum parameter of a templated path is checked
against its own path. With another templated path before it (`/users/{id}` ahead of
`/orders/{id}`), the generator read the first path instead, warned `ENUM_VALUES_EXCLUDED` for an
enum the document does not contradict, and typed the array by its values; the result depended on
the order of the paths. The array is now typed by its path's location
(`` FlattenedDeepRequired<paths>[`/orders/${number}`]… ``) whatever the order, and no warning is
given.
