---
"openapi-typesafe-fetch": patch
---

A wrapper generic in its init (`Init extends FetchOptions<…>`, passed on to `client.GET`) no
longer types `data` as the JSON body only: a caller may pass `{ parseAs: "text" }`, so `data` is
every body that `parseAs` may pick, as in openapi-fetch. The same holds for an init typed
`FetchOptions<…>` of a generic path. Options that set `parseAs` keep the body of that `parseAs`,
and a call or a wrapper with a known init keeps its exact `data`.
