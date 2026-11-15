---
"openapi-typesafe-fetch": patch
---

A wrapper generic in the path that sets `parseAs`, such as
`client.GET(path, { ...init, parseAs: "text" })` or an `init` typed
`FetchOptions<…> & { parseAs: "text" }`, types `data` as the body of that `parseAs` again
(`string` for `"text"`), as openapi-fetch does. Before, it was the text or any JSON body of the
paths, so assigning it to `string | undefined` failed. Each member of a union of options now
types its own data: `{ parseAs: ParseAs } | undefined` gives every body, as in openapi-fetch.
