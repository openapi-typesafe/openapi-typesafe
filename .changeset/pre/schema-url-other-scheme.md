---
"openapi-typesafe": patch
---

A schema or `root` that is a URL of a scheme other than `file:`, `http:` and `https:`
(`openapi-typesafe s3://bucket/api.yaml`, or `openapiTS(new URL("s3://bucket/api.yaml"))`) now
fails with `SCHEMA_SOURCE_INVALID` before anything is read. It used to read the local file
`./s3:/bucket/api.yaml`, and `-o s3:/bucket/api.yaml` then overwrote that file with the types.
