---
"openapi-typesafe-fetch": patch
---

`style` and `explode` of the `array` and `object` options of `QuerySerializerOptions` are optional,
and one left out takes the client's value, else its default (`form` or `deepObject`, exploded): a
request's `{ array: { explode: false } }` keeps the client's `style`. `onError` may return an
`Error` of another realm (an iframe, `node:vm`); it was rejected as not an error.
