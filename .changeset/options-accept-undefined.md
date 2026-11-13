---
"openapi-typesafe-fetch": patch
---

Every optional option of `createClient()` and of a request accepts `undefined` in its type, not
only the members of `querySerializer`: `baseUrl`, `fetch`, `Request`, `FormData`,
`querySerializer`, `bodySerializer`, `pathSerializer`, `headers`, `requestInitExt`, `parseAs`,
`middleware` and `params`. The client already counted `undefined` as left out, so a wrapper that
passes its own optional options on now compiles with `exactOptionalPropertyTypes`.
