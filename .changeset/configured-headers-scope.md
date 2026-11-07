---
"openapi-typesafe": patch
---

Headers from `resolve.http.headers` in `redocly.yaml` go only to the URLs their patterns match.
They are no longer sent on through a redirect to another origin (fetch kept every header but
`Authorization`, `Cookie` and `Proxy-Authorization`), a `*` in a pattern no longer matches across
the query or fragment of a URL, and a header goes over HTTPS only unless its pattern starts with
`http://`. A project that sends a header to a plain HTTP server with a pattern such as
`localhost:8080/**` writes it as `http://localhost:8080/**`. Redirects are followed by the loader,
at most 20, also with `--remote-ref-hosts` (5 before). See ADR-033.
