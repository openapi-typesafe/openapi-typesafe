---
"openapi-typesafe-migrate": patch
---

The files of a split API description (`components/schemas/Job.yaml`, reached by `$ref` from
`openapi.yaml` or `openapi.json`) and OpenAPI Overlay and Arazzo documents are data now, like the
API description itself: their example `command` and `script` values are no longer rewritten, so
the change no longer reaches the generated comments.
