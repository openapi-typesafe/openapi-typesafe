---
"openapi-typesafe": patch
---

A `file:` URL that names no local path (`file://specs/a.yaml`, where `file:specs/a.yaml` was meant,
or `file:///a%2Fb.yaml`) no longer crashes the CLI with a stack trace and exit code 70. As the
schema with `--output`, it fails with `SCHEMA_LOAD_FAILED`, as it does without `--output`. In
`redocly.yaml`, such a `root` or `output` fails only its own API, and the other APIs are generated.
