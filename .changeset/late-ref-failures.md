---
"openapi-typesafe": patch
---

A `$ref` failure reached from two documents, such as a schema that is a `$ref` to itself and an
external file that refers to it, now fails once with its typed error (`SCHEMA_REF_INVALID` or
`SCHEMA_KEY_UNSUPPORTED`). Before, the CLI printed the error, then a stack trace, and exited with 1
(the code of stale `--check` output) instead of 3; the Node API rejected, and then left an
unhandled rejection that ended the calling process. The cause is in Redocly's `$ref` resolution,
so the loader now resolves the documents first and waits for every lookup (ADR-030).
