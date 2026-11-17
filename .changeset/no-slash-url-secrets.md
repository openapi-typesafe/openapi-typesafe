---
"openapi-typesafe": patch
---

A URL written without `//`, which the CLI loads (`http:host/api.yaml?key=…`, `http:/host/…`,
`http:\\host\…`), now has its query and user info hidden in every message and in the line for a
written file, as any other URL has: the schema argument, `--output`, `--redocly`,
`--local-ref-root`, an API's `root`, and a location that does not parse. A `://` in the query of a
URL no longer starts a second URL there, so the query before it stays hidden too
(`http:host/x.yaml?key=…&next=http://h`). The query of a `file:` URL with an empty path
(`-o file:?x`) is now hidden too.
