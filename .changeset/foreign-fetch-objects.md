---
"openapi-typesafe-fetch": patch
---

Middleware may return a `Request` or `Response` from the `undici` package, from another realm (an
iframe, an Electron host) or of a custom `Request` class. They are recognized by their members, not
by `instanceof`, which rejected them with "onRequest: must return new Request()" (upstream #1847):
a `Request` by its `method`, `url` and `headers`, a `Response` by its `status` and `headers`.
`Headers` from the `undici` package passed as `headers` are no longer dropped.
