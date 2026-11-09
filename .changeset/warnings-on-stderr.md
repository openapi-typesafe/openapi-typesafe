---
"openapi-typesafe": patch
---

Without `--output`, the CLI prints its warnings to stderr instead of dropping them, and debug
lines (`DEBUG=openapi-ts:*`) go to stderr instead of stdout, so they no longer end up in types
piped to a file. openapi-typescript printed no warnings when it wrote to stdout.
