---
"openapi-typesafe-fetch": patch
---

With a schema of hundreds of paths, a call with a wrong path reports the path and the editor
completes paths on TypeScript 5.4 to 6.0. It gave "Type instantiation is excessively deep and
possibly infinite" (TS2589) and no completion (upstream #1882): the init type of all operations
of the method was one deep type, and is now computed per operation. The type matrix checks this
with the GitHub schema on every supported TypeScript version.
