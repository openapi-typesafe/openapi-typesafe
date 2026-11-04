---
"openapi-typesafe-fetch": patch
---

`createClient` and `createPathBasedClient` accept `fetch` and `Request` of another Fetch API
implementation, such as the `undici` package (upstream #2562). Their types are not the DOM lib's,
so an overload with `OtherFetchClientOptions` checks only that `fetch` returns a promise and
`Request` is a class. An inline `fetch` still gets a typed `Request` input.
