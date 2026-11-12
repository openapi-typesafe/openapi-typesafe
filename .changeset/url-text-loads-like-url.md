---
"openapi-typesafe": patch
---

A schema given as text that is a URL (a string, a `Buffer`, a stream, or stdin in the CLI) is now
loaded exactly like that `URL`. A `file:` URL that names no local path (`file://host/a.yaml`,
`file:///a%2Fb.yaml`) fails with `SCHEMA_LOAD_FAILED` instead of a plain `TypeError` (in the CLI,
"Unexpected error" with exit code 70). A remote root that redirects to another host loads with
`remoteRefHosts: []` or `--remote-ref-hosts ""`, as it does for a `URL`. And
`echo file://$PWD/api.yaml | openapi-typesafe -o api.yaml` fails with `CLI_OUTPUT_IS_INPUT`
instead of overwriting the schema with the types.
