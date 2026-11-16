---
"openapi-typesafe": patch
---

Entries of `.redocly.lint-ignore.yaml` apply to a remote schema written in a form other than
the URL parser's own, such as `root: "http://host/my api.yaml"` in `redocly.yaml` or
`http://LOCALHOST/x/../api.yaml` as the argument: the schema keeps the name `redocly lint` gives
it, as remote `$ref` documents do.
