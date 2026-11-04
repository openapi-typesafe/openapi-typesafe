---
"openapi-typesafe": minor
---

Add opt-in limits for `$ref` in documents you did not write. `--local-ref-root <dir>`
(`localRefRoot`) loads local `$ref` files only from that directory, and `--remote-ref-hosts
<hosts>` (`remoteRefHosts`) loads remote `$ref` documents only from the listed hosts, including
each redirect. A refused `$ref` fails with the new error code `SCHEMA_REF_FORBIDDEN`. Without the
options nothing changes. See "Untrusted documents" in the advanced guide.
