---
"openapi-typesafe-fetch": patch
---

`client.request(method, path, { parseAs })` types `data` by `parseAs`, as `client.GET()` and the
other method calls do: `{ parseAs: "text" }` gives a `string`, `"stream"` the body stream. Before,
`data` was always the JSON body. A literal in `params` or `body` next to `parseAs`, such as an
enum value, no longer loses the `parseAs` type either.
