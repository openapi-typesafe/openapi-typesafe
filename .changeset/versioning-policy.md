---
"openapi-typesafe": patch
"openapi-typesafe-fetch": patch
"openapi-typesafe-react-query": patch
"openapi-typesafe-helpers": patch
"openapi-typesafe-migrate": patch
---

The docs now say what the 1.x version promises (compatibility report, "Versioning"): the entry
points, documented options, flags, codes and generated types are stable; a minor release may add
codes, options, fix names, IR node kinds and union members, so a `switch` over them needs a
`default` branch; deep imports, message texts, undocumented `details` keys and log formats are
not covered. Every README links to it.
