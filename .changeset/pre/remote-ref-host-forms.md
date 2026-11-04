---
"openapi-typesafe": patch
---

`--remote-ref-hosts` (`remoteRefHosts`) now matches hosts as URLs write them. A listed default
port (`api.example.com:443`), a bare IPv6 address (`::1`), a trailing dot, a Unicode host name or
another IPv4 form now match the URLs they name; before, such `$ref`s were refused. Entries that
are not a host (with `/`, `@` or `#`) never match.
