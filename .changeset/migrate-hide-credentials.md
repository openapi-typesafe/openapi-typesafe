---
"openapi-typesafe-migrate": patch
---

The report and the log no longer show credentials from dependency specs. A spec such as
`git+https://<token>@github.com/…` or `https://user:password@registry/…` is now shown as
`https://***@…`; the file keeps the spec as written.
