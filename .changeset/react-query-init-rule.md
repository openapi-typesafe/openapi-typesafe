---
"openapi-typesafe-react-query": patch
"openapi-typesafe-fetch": patch
---

The hooks decide whether the init may be left out with openapi-react-query's own condition, as the
fetch client does with openapi-fetch's. A hook type copied from openapi-react-query 0.5.4, which
code generic in the paths assigns `$api.queryOptions` to, now takes the hooks; before, it failed
with error TS2322. Calls are checked as before, also for a union of paths. The fetch client no
longer exports `IsInitOptional`, which only the hooks used; `PathOperation` stays exported for
them and is marked internal.
