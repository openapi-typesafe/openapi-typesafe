---
"openapi-typesafe-migrate": patch
---

The report now says when a project depends on `swr-openapi`: it takes its client type from
`openapi-fetch`, its peer dependency, so `openapi-fetch` must be aliased to
`openapi-typesafe-fetch` with `overrides` or `resolutions`.
