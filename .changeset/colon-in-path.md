---
"openapi-typesafe": patch
---

A path with a colon in its name, such as `-o out:v2.ts` or the schema `spec:v2.yaml`, is read as a
file path. Any text before a colon was taken as a URL scheme, so the output failed with
`CLI_OUTPUT_INVALID`. A location is a URL when it starts with `http:`, `https:` or `file:`, or with
a scheme and `//`.
