---
"openapi-typesafe-fetch": patch
---

A `ReadableStream` body, or an async iterable such as a Node.js `Readable`
(`fs.createReadStream()`), is sent as a stream, with the `duplex: "half"` option that the Fetch
standard requires for it. It was JSON-encoded (to `{}`, or to the internal fields of a `Readable`)
with a JSON `Content-Type`, so a streamed upload was lost without an error.
The declarations name the async iterable type with `/// <reference lib="es2018.asynciterable" />`,
so a project whose `lib` is older than ES2018 still compiles.
