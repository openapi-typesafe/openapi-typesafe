---
"openapi-typesafe": patch
---

A document whose remote `$ref`s keep naming new URLs no longer sends requests until the local
ports run out (or forever). One run loads at most 10,000 remote documents and fetches at most 16 at
the same time; the next document past the bound fails with `SCHEMA_REF_FORBIDDEN`, reason
`too-many-remote-documents`. See ADR-033.
