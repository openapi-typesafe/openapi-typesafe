---
"openapi-typesafe-fetch": patch
---

`defaultBodySerializer` declares what it returns: a raw body (`FormData`, `Blob`,
`URLSearchParams`, `ArrayBuffer`, a typed array) as its own type, `undefined` for `undefined`, and
`string | FormData` for an object passed with `headers` (a multipart `Content-Type` makes it
`FormData`). It was declared `string` for every body. A call without `headers` on a JSON value is
still `string`.
