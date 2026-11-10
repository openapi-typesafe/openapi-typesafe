---
"openapi-typesafe": patch
---

With `--default-non-nullable` (on by default), a parameter or request body is found by the
document's structure. A response of a path such as `/system-parameters`, or a property named
`parameters`, kept a defaulted property optional because its location held the word; it is now
required, as in any other response.
