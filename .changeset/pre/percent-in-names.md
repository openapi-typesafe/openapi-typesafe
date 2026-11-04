---
"openapi-typesafe": patch
---

Fix names that contain `%` (for example a property `50%`): the generator escapes `%` as `%25` in the `$ref` pointers it builds, so reading them back no longer throws `URIError`, and a name like `a%2Fb` no longer reads back as `a/b`. The exported `createRef` escapes the same way. Fixes upstream #2251, #2828.
