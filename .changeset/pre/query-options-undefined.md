---
"openapi-typesafe-fetch": patch
---

A request's `querySerializer` option set to `undefined` (`{ array: { explode: undefined } }`, as a
wrapper passes its own optional option on) now takes the client's value, as an option left out
does. It replaced the client's value, so the default style was sent.
