---
"openapi-typesafe-migrate": patch
---

`openapi-typesafe-migrate | head` (or any reader that closes the pipe early) no longer crashes with
an `EPIPE` stack trace and exit code 1: the rest of the report is dropped and the run ends as it
would have.
