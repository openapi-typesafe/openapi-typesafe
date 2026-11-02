---
"openapi-typesafe": minor
---

Report document limits as typed errors instead of crashes or hangs. A document nested too deeply
for the call stack fails with `SCHEMA_TOO_DEEP`. A `$ref` cycle with no schema in between fails
with `SCHEMA_REF_INVALID`. Keys such as `valueOf` that the schema loader cannot read fail with
`SCHEMA_KEY_UNSUPPORTED` and are all listed. A remote `$ref` that does not answer stops after 60
seconds. See the new Limits section in the advanced guide.
