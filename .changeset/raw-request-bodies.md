---
"openapi-typesafe-fetch": patch
---

Request bodies that `fetch` sends as they are now go out unchanged, without a JSON `Content-Type`:
`Blob`, `File`, `URLSearchParams`, `ArrayBuffer` and typed arrays. Before, they were JSON-encoded to
`{}`, so a binary upload lost its data. A nested object in an `application/x-www-form-urlencoded`
body now throws instead of being sent as `[object Object]`, and a path that already has a query
string gets `&` instead of a second `?`. See ADR-013, decisions 6 to 8.
