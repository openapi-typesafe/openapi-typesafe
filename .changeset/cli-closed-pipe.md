---
"openapi-typesafe": patch
---

Types piped to a reader that stops early (`openapi-typesafe api.yaml | head`) no longer crash the
CLI with `EPIPE` and exit code `1`; the rest is dropped and the exit code stays `0`.
