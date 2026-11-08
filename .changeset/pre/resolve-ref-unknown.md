---
"openapi-typesafe": patch
---

The deprecated `resolveRef` takes the document as `unknown` instead of `any`, so any value is still
accepted. It now returns the node when a `$ref` that is not a string is found, instead of failing.
