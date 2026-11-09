---
"openapi-typesafe": minor
---

Remote documents have size limits. The loader reads each body as a stream and counts the bytes
after `gzip`, `deflate` or `br` is decoded, so a compressed "zip bomb" behind a remote `$ref` no
longer fills the memory: 1.6 MB on the wire became 1.6 GB before. A body larger than 128 MiB, or
remote documents larger than 256 MiB together for one schema, fail with `SCHEMA_REF_FORBIDDEN` and
the new reasons `remote-document-too-large` and `remote-documents-too-large`. The parser also
counts the nodes it builds: remote documents that parse into more than 8,000,000 nodes together
fail with the new reason `remote-documents-too-many-nodes`, so a dense body such as
`[{},{},…]` within the byte limits no longer ends the process with an out-of-memory crash.
The largest real document we know is 71 MiB and 2.65 million nodes. A `customFetch` in the
Redocly config is limited too.
