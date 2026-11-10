---
"openapi-typesafe-migrate": patch
---

A module specifier with a bundler query (`"openapi-fetch?url"`, `"openapi-fetch/x.js?raw"`) gets the
new package name and keeps its query. Before, a query right after the package name hid the package,
and the specifier was left as it was.
