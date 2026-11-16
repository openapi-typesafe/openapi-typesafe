---
"openapi-typesafe-fetch": patch
---

Headers given as an iterable that can be read only once, such as `map.entries()` or a generator,
are sent with a request that has a body. The client read them twice for such a request, and the
first read used them up, so a `POST` with a body went out without its `authorization` header. Such
headers on the client are now sent with every request too, not only the first one.
