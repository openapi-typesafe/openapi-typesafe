---
"openapi-typesafe-fetch": minor
---

A `FormData`, `Blob`, `File` or `ReadableStream` body from `undici` or another realm (an iframe) is
sent as it is: the client told a body by `instanceof`, so it JSON-encoded one of another class as
`{}`. `createClient` takes a `FormData` class next to `Request`: a multipart body is built with it,
and a FormData body of another class is copied into one of it, since undici's `Request` read the
platform's FormData as the text `[object FormData]`. With undici, pass
`createClient({ fetch, Request, FormData })` from the package. An instance of the platform's own
global class is still sent as it is, so the FormData, Blob and URLSearchParams of React Native and
the Blob and File of jsdom 20 (Jest 29), which have no type tag or no `arrayBuffer`, keep working.
