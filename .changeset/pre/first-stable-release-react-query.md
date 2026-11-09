---
"openapi-typesafe-react-query": major
---

First stable release of openapi-typesafe-react-query, the successor of openapi-react-query 0.5.4.
Its peer dependency is now `openapi-typesafe-fetch` instead of `openapi-fetch`, next to
`@tanstack/react-query` 5.80 or newer. From 1.0 the package follows semver.

Changes that can need work when you move from openapi-react-query 0.5.4:

- `engines.node` is `>=22`.
- Queries and mutations fail on every non-OK response, also one without a body or with a falsy
  body such as `0` (upstream [#2070](https://github.com/openapi-ts/openapi-typescript/issues/2070), [#2531](https://github.com/openapi-ts/openapi-typescript/issues/2531)). Without an error body (an empty `503` from a
  proxy, or a status whose operation declares no content) they throw a `ResponseError` with
  `status` and `response`, whose message names the status, not the URL. The `error` type of every
  hook and of `queryOptions` is the error body or `ResponseError` (exported types `ResponseError`
  and `QueryError`): narrow with `error instanceof Error` before you read a field of the body;
  `error.message` still compiles.
- `useInfiniteQuery` has its own key, `[...queryKey, "infinite"]`, so it no longer shares a cache
  entry with `useQuery` (upstream [#2184](https://github.com/openapi-ts/openapi-typescript/issues/2184)). Prefix matches still work; code that uses the exact
  key must append `"infinite"`.
- An `undefined` page param is left out of the request; it was sent as `0` (upstream [#2715](https://github.com/openapi-ts/openapi-typescript/issues/2715),
  [#2340](https://github.com/openapi-ts/openapi-typescript/issues/2340)).
