---
"openapi-typesafe-fetch": patch
---

A `ReadableStream` body is sent as a stream, with the `duplex: "half"` option that the Fetch
standard requires for it. It was JSON-encoded to `{}` with a JSON `Content-Type`, so a streamed
upload was lost without an error (ADR-013).
