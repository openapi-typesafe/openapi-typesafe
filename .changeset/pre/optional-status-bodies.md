---
"openapi-typesafe-fetch": patch
---

A status that a response map marks optional (`200?: X`, `Partial<Record<200 | 404, X>>`) or types
as `X | undefined` now types `data` and `error` by its body, as a required status does. They were
`unknown`.
