---
"openapi-typesafe": patch
---

Clearer CLI messages for two failures. A remote schema that cannot be fetched now prints the
network reason and the URL (`fetch failed: connect ECONNREFUSED … (http://…)`), not only
`fetch failed`; the Node API error keeps its message and now has the network error in `cause`.
YAML nested deeper than the parser limit now says to move nested schemas to `components` and
use `$ref`.
