---
"openapi-typesafe-react-query": patch
---

`createClient(fetchClient, { keyScope })` and the `pageParamName` option of `useInfiniteQuery`
accept `undefined` under `exactOptionalPropertyTypes`, so a wrapper can pass its own optional
option on (`{ keyScope: options.keyScope }`). `undefined` counts as left out, as it already did at
run time.
