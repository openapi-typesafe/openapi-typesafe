---
"openapi-typesafe": patch
---

`--exclude-deprecated`: a deprecated component that kept output still references, such as the
`items` of a kept array or a kept operation's response, is kept, so the output no longer names a
missing `components["schemas"]` key (TS2339). A deprecated component that only dropped parts
reference (deprecated operations, parameters or properties) is still left out.
