---
"openapi-typesafe": patch
---

The CLI hides the whole query of a URL it prints also after a space or a quote: the line for a
written file showed `?*** cret` for `"https://host/api.yaml?key=se cret"`. The same holds for
every CLI message that names the schema, an output, `--redocly`, `--local-ref-root` or an API's
`root`.
