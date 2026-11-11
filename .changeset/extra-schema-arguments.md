---
"openapi-typesafe": patch
---

A second schema argument fails with the new error `CLI_INPUT_EXTRA` (exit code 2). Only the first
one was generated, so an unquoted glob that the shell expanded (`g/*.yaml`) generated one schema and
passed.
