---
"openapi-typesafe-fetch": patch
"openapi-typesafe-helpers": patch
---

A hand-written response map with only an index signature over statuses
(`responses: Record<string, Pet>`, `{ [status: number]: Pet }`) types `data` and `error` by its
value, as any status may answer with it. Both were `never`. `Record<string, any>` gives `any`, as
`createClient<any>()` does, and code generic in its operation still reads such a map as `unknown`.
Generated types always name their statuses and are not affected.
