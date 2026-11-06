---
"openapi-typesafe": patch
---

A `DEBUG=openapi-ts:*` line without a duration now has a space after its group, as the timed
lines do: `openapi-ts:lint Ignored by the lint ignore file: …` instead of
`openapi-ts:lintIgnored by the lint ignore file: …`.
