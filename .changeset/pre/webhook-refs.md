---
"openapi-typesafe": patch
---

A webhook that is a `$ref` (often to `components/pathItems`) is typed as the path item it points
at, as a `$ref` in `paths` is: `petAdded: components["pathItems"]["PetEvent"]`. Every method of
such a webhook was `never`.
