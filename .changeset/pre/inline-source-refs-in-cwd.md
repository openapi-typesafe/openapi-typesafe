---
"openapi-typesafe": patch
---

Relative `$ref`s of a string, object, buffer or stream source (and of a schema read from stdin) now
resolve in `cwd`. openapi-typescript 7.13 and 1.0.0-rc.0 read them from the parent of `cwd`. A
`cwd` path with `#` or `%` works, and a `cwd` URL without a trailing slash is a directory. A setup
that kept the shared files one level up must now pass that directory as `cwd` (ADR-023).
