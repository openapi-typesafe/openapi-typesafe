---
"openapi-typesafe": patch
---

With `--enum`, the array items, record values, tuple elements and nested properties of a property
and of an inline `allOf` item of one schema share one enum, as the property itself does. They got
two enums before (`TList.a[] & TList_2[]`), so the type was `never`; now it is `TList.a[] &
TList[]`.
