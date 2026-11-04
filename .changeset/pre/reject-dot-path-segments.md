---
"openapi-typesafe-fetch": patch
---

`defaultPathSerializer` throws when a path parameter makes a `.` or `..` path segment, so a value like `..` can no longer move a request to another endpoint (path traversal). Such a request now rejects before `fetch` is called (ADR-013). Fixes upstream #2483.
