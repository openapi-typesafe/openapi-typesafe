---
"openapi-typesafe": patch
---

A `$ref` that is a `file:` URL (`file:///specs/pet.yaml`, `file:pet.yaml`) now loads the file it
names, checked against `--local-ref-root` as a path is. A `$ref` that is a URL of another scheme
(`s3://bucket/pet.yaml`) fails with `SCHEMA_REF_FORBIDDEN` (`reason: "unsupported-url"`). Both
used to be read as paths below the document's folder, such as `./s3:/bucket/pet.yaml`.
