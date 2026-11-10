---
"openapi-typesafe-fetch": patch
---

The query of a request whose path template has a fragment (`/docs#intro`) goes before the
fragment, joined with a query the template already has. It was added after the `#`, where it is
part of the fragment, so `fetch` never sent it.
