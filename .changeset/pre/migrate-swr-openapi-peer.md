---
"openapi-typesafe-migrate": patch
---

The report now says when a project depends on `swr-openapi`: it takes its types from
`openapi-fetch`, its peer dependency, so `openapi-fetch` must stay installed next to
`openapi-typesafe-fetch`.
