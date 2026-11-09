---
"openapi-typesafe-fetch": patch
---

A string body with a line-based JSON `Content-Type` (`application/x-ndjson`, `application/jsonl`,
`application/json-seq`) is sent as is. It was JSON-encoded into one quoted string, because every
media type with `json` in it counted as JSON; now only `application/json` and `+json` types do
(RFC 6838, ADR-013).
