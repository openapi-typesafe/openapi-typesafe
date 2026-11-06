---
"openapi-typesafe-fetch": patch
---

`defaultBodySerializer` declares what it returns: a raw body (`FormData`, `Blob`,
`URLSearchParams`, `ArrayBuffer`, a typed array) as its own type, `undefined` for `undefined`, and
a string for a primitive. An object is a string without `headers`, and with headers written as a
record literal: `FormData` for a `multipart/form-data` `Content-Type`, a string for another one or
none. With other headers (a `Headers` object, a variable typed `HeadersOptions`) an object gives
`string | FormData`. It was declared `string` for every body, which was wrong for raw bodies and
multipart objects.

This can break code that compiled against openapi-fetch's types: a result used as a `string`
where the body is a raw body, `unknown`, or an object passed with headers whose `Content-Type` the
type does not tell, and `defaultBodySerializer(body)` in a global `bodySerializer`, whose `body` is
typed `undefined` there. Check the type (`typeof result === "string"`) or narrow the body first.
