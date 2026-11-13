---
"openapi-typesafe-fetch": patch
---

An error body is parsed as JSON only when its `Content-Type` is a JSON media type (`json` or a
`+json` suffix), or when the response has no `Content-Type` and the body is JSON. Any other error
body, such as `text/plain` or HTML, is returned as text, as its `string` type says. A `text/plain`
error body `429`, `true`, `0` or `null` came back as a number, a boolean or `null`, and with `0`
or `null` the check `if (error)` was skipped. openapi-fetch parses every error body, so this
differs from it.
