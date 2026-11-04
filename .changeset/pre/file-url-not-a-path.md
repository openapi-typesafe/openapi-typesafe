---
"openapi-typesafe": patch
---

A `file:` URL source that names no path on the platform (an encoded slash, a host on POSIX, no
drive letter on Windows) fails with `SCHEMA_LOAD_FAILED` and the URL in `details.source`, as a
missing file does. Before, it failed with Node's untyped `TypeError`.
