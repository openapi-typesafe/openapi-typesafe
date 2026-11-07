---
"openapi-typesafe-fetch": patch
---

A request whose path starts with `//` once the path parameters are in now rejects with
`Empty first path segment in …`, before `fetch` is called. With the default `baseUrl` `""`,
`/{org}/{repo}` with `org: ""` and `repo: "evil.example"` gave `//evil.example`, which a browser
sends to `https://evil.example/` with the request's headers. Empty values in later segments are
sent as before. See ADR-030, amendment.
