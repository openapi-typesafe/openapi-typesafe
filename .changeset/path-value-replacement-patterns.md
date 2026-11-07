---
"openapi-typesafe-fetch": patch
---

A path parameter value or object key with `$'`, `` $` ``, `$&` or `$$` is now sent as written.
`defaultPathSerializer` put values into the template with a string replacement, which read these as
patterns: an object key `$'` copied the rest of the template, a later `{name}` included, into the
path.
