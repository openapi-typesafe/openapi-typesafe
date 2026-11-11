---
"openapi-typesafe": patch
---

`--check` compares lines, not line ends: an output that Git checked out with CRLF line ends
(`core.autocrlf` on Windows) is no longer reported as stale (`OUTPUT_STALE`).
