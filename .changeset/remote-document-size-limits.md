---
"openapi-typesafe": minor
---

Remote documents have size limits. The loader reads each body as a stream and counts the bytes
after `gzip`, `deflate` or `br` is decoded, so a compressed "zip bomb" behind a remote `$ref` no
longer fills the memory: 1.6 MB on the wire became 1.6 GB before. A body larger than 256 MiB, or
remote documents larger than 512 MiB together in one run, fail with `SCHEMA_REF_FORBIDDEN` and
the new reasons `remote-document-too-large` and `remote-documents-too-large`. The largest real
document we know is 71 MiB. A `customFetch` in the Redocly config is limited too.
