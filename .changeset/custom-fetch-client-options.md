---
"openapi-typesafe-fetch": patch
---

`OtherFetchClientOptions`, the client options type for a Fetch API implementation with its own
types (such as `undici`), is renamed to `CustomFetchClientOptions` before 1.0, so that the name
says what it is for. Only the rc versions had the old name; code that imports it uses the new one.
