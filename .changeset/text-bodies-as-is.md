---
"openapi-typesafe-fetch": patch
---

A string request body is sent as is when the request sets a non-JSON `Content-Type` such as `text/plain`; before, it was JSON-encoded and got extra quotes. With a JSON `Content-Type`, or none, a string is still sent as a JSON string value (ADR-013). Fixes upstream #2555, #2382.
